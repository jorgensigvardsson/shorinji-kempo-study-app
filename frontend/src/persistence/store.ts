import { LocalStorageBackend, type PersistenceBackend } from "./backend";
import { deepEqual } from "../utilities/deep-equal";
import { canonicalKenshiNumber, createDefaultAppDataDocument, isKenshiNumber, unknownDataFields, type AppDataDocument, type AppDataState } from "./schema";

type DataChangedCallback<TKey extends keyof AppDataState> = (data: AppDataState[TKey]) => void;
type UnregisterDataChangedCallback = () => void;

export class AppDataStore {
  private readonly callbacks: {
    [K in keyof AppDataState]: Map<number, DataChangedCallback<K>>;
  };

  private nextListenerId = 0;
  private nextDocumentListenerId = 0;
  private document: AppDataDocument;
  private readonly documentCallbacks = new Map<number, (document: AppDataDocument) => void>();

  constructor(private readonly backend: PersistenceBackend<AppDataDocument> = new LocalStorageBackend<AppDataDocument>("app-data-document")) {
    this.document = sanitizeDocument(backend.load(createDefaultAppDataDocument()));
    this.callbacks = {
      grade: new Map<number, DataChangedCallback<"grade">>(),
      language: new Map<number, DataChangedCallback<"language">>(),
      theme: new Map<number, DataChangedCallback<"theme">>(),
      currentWeekAnchor: new Map<number, DataChangedCallback<"currentWeekAnchor">>(),
      syncProvider: new Map<number, DataChangedCallback<"syncProvider">>(),
      kenshiNumber: new Map<number, DataChangedCallback<"kenshiNumber">>(),
      notes: new Map<number, DataChangedCallback<"notes">>(),
      hokeiRanks: new Map<number, DataChangedCallback<"hokeiRanks">>(),
      hokeiListSelection: new Map<number, DataChangedCallback<"hokeiListSelection">>(),
      quizStreakHighScore: new Map<number, DataChangedCallback<"quizStreakHighScore">>(),
      knownFlashCards: new Map<number, DataChangedCallback<"knownFlashCards">>(),
      showKanjiOnHokeiCards: new Map<number, DataChangedCallback<"showKanjiOnHokeiCards">>(),
      weeklyPlanCompletions: new Map<number, DataChangedCallback<"weeklyPlanCompletions">>(),
      gradingFundamentalCompletions: new Map<number, DataChangedCallback<"gradingFundamentalCompletions">>(),
      gradingTheoryCompletions: new Map<number, DataChangedCallback<"gradingTheoryCompletions">>(),
    };
  }

  get<TKey extends keyof AppDataState>(key: TKey): AppDataState[TKey] {
    return this.document.data[key];
  }

  getDocument(): AppDataDocument {
    return clone(this.document);
  }

  set<TKey extends keyof AppDataState>(key: TKey, value: AppDataState[TKey]): void {
    if (Object.is(this.document.data[key], value)) {
      return;
    }

    this.document = {
      ...this.document,
      updatedAt: new Date().toISOString(),
      data: {
        ...this.document.data,
        [key]: value,
      },
    };

    this.backend.save(this.document);
    this.notify(key, value);
    this.notifyDocument();
  }

  setDocument(document: AppDataDocument): void {
    const previous = this.document;
    this.document = sanitizeDocument(document);
    this.backend.save(this.document);

    const keys = Object.keys(this.document.data) as Array<keyof AppDataState>;
    for (const key of keys) {
      if (!deepEqual(previous.data[key], this.document.data[key])) {
        this.notify(key, this.document.data[key]);
      }
    }

    this.notifyDocument();
  }

  subscribe<TKey extends keyof AppDataState>(
    key: TKey,
    callback: DataChangedCallback<TKey>
  ): UnregisterDataChangedCallback {
    const listenerId = this.nextListenerId++;
    const callbacks = this.callbacks[key] as Map<number, DataChangedCallback<TKey>>;
    callbacks.set(listenerId, callback);

    return () => {
      callbacks.delete(listenerId);
    };
  }

  subscribeDocument(callback: (document: AppDataDocument) => void): UnregisterDataChangedCallback {
    const listenerId = this.nextDocumentListenerId++;
    this.documentCallbacks.set(listenerId, callback);

    return () => {
      this.documentCallbacks.delete(listenerId);
    };
  }

  private notify<TKey extends keyof AppDataState>(key: TKey, value: AppDataState[TKey]): void {
    // A document can carry fields written by a newer build, which are preserved but
    // have no subscriber map here. Nothing in this build reads them, so there is
    // nobody to notify.
    const callbacks = this.callbacks[key] as Map<number, DataChangedCallback<TKey>> | undefined;
    if (!callbacks) return;

    for (const callback of callbacks.values()) {
      callback(value);
    }
  }

  private notifyDocument(): void {
    const snapshot = this.getDocument();
    for (const callback of this.documentCallbacks.values()) {
      callback(snapshot);
    }
  }
}

let appDataStore: AppDataStore | null = null;

export function getAppDataStore(): AppDataStore {
  if (!appDataStore) {
    appDataStore = new AppDataStore();
  }

  return appDataStore;
}

function clone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function sanitizeDocument(input: AppDataDocument): AppDataDocument {
  const fallback = createDefaultAppDataDocument();
  return {
    version: typeof input.version === "number" ? input.version : fallback.version,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : fallback.updatedAt,
    deviceId: typeof input.deviceId === "string" ? input.deviceId : fallback.deviceId,
    data: {
      // Fields written by a newer build come first and are kept as they are. Without
      // this, sanitizing would rebuild `data` from the known keys alone and drop them,
      // and syncing that back would delete newer data for every one of the user's
      // devices. Known fields are still validated below and override anything here.
      ...unknownDataFields(input.data),
      grade: input.data?.grade ?? fallback.data.grade,
      language: input.data?.language ?? fallback.data.language,
      theme: input.data?.theme ?? fallback.data.theme,
      currentWeekAnchor: isWeekAnchor(input.data?.currentWeekAnchor)
        ? input.data.currentWeekAnchor
        : fallback.data.currentWeekAnchor,
      syncProvider: isSyncProvider(input.data?.syncProvider) ? input.data.syncProvider : fallback.data.syncProvider,
      kenshiNumber: readKenshiNumber(input.data?.kenshiNumber),
      notes: isRecord(input.data?.notes) ? input.data.notes : fallback.data.notes,
      hokeiRanks: isRankRecord(input.data?.hokeiRanks) ? input.data.hokeiRanks : fallback.data.hokeiRanks,
      hokeiListSelection: typeof input.data?.hokeiListSelection === "string" ? input.data.hokeiListSelection : fallback.data.hokeiListSelection,
      quizStreakHighScore: typeof input.data?.quizStreakHighScore === "number" ? input.data.quizStreakHighScore : fallback.data.quizStreakHighScore,
      knownFlashCards: isFlashCardKnownRecord(input.data?.knownFlashCards) ? input.data.knownFlashCards : fallback.data.knownFlashCards,
      showKanjiOnHokeiCards: typeof input.data?.showKanjiOnHokeiCards === "boolean" ? input.data.showKanjiOnHokeiCards : fallback.data.showKanjiOnHokeiCards,
      weeklyPlanCompletions: isCompletionRecord(input.data?.weeklyPlanCompletions)
        ? input.data.weeklyPlanCompletions
        : fallback.data.weeklyPlanCompletions,
      gradingFundamentalCompletions: isCompletionRecord(input.data?.gradingFundamentalCompletions)
        ? input.data.gradingFundamentalCompletions
        : fallback.data.gradingFundamentalCompletions,
      gradingTheoryCompletions: isCompletionRecord(input.data?.gradingTheoryCompletions)
        ? input.data.gradingTheoryCompletions
        : fallback.data.gradingTheoryCompletions,
    },
  };
}

// Documents written before cloud-storage sync was removed can still name a
// provider we no longer have ("onedrive", "google-drive", "dropbox"); those fall
// back to "local", i.e. signed out.
function isSyncProvider(value: unknown): value is AppDataState["syncProvider"] {
  return value === "local" || value === "backend";
}

// Documents written before hombu started issuing four-digit leading groups hold nine
// digits; those are the same number as the ten-digit form with its leading zero, so
// they are read as that rather than left as a second spelling of one number.
function readKenshiNumber(value: unknown): string | undefined {
  if (typeof value !== "string" || !isKenshiNumber(value)) {
    return undefined;
  }

  return canonicalKenshiNumber(value);
}

function isRecord(value: unknown): value is Record<string, string> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWeekAnchor(value: unknown): value is { week: number; anchorDate: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as { week?: unknown; anchorDate?: unknown };
  return typeof candidate.week === "number" && Number.isFinite(candidate.week) && typeof candidate.anchorDate === "string";
}

function isFlashCardKnownRecord(value: unknown): value is Record<string, { known: boolean; updatedAt: string }> {
  if (!isRecord(value)) return false;
  for (const entry of Object.values(value)) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return false;
    const candidate = entry as { known?: unknown; updatedAt?: unknown };
    if (typeof candidate.known !== "boolean" || typeof candidate.updatedAt !== "string") return false;
  }
  return true;
}

function isRankRecord(value: unknown): value is Record<string, { value: 1 | 2 | 3; updatedAt: string }> {
  if (!isRecord(value)) {
    return false;
  }

  for (const entry of Object.values(value)) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return false;
    }

    const candidate = entry as { value?: unknown; updatedAt?: unknown };
    if ((candidate.value !== 1 && candidate.value !== 2 && candidate.value !== 3) || typeof candidate.updatedAt !== "string") {
      return false;
    }
  }

  return true;
}

function isCompletionRecord(value: unknown): value is Record<string, { completedAt: string }> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value).every(entry => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return false;
    const completedAt = (entry as { completedAt?: unknown }).completedAt;
    return typeof completedAt === "string" && Number.isFinite(Date.parse(completedAt));
  });
}

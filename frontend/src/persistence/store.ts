import { LocalStorageBackend, type PersistenceBackend } from "./backend";
import { deepEqual } from "../utilities/deep-equal";
import { APP_DISPLAY_NAME_MAX_LENGTH, canonicalKenshiNumber, createDefaultAppDataDocument, isKenshiNumber, unknownDataFields, type AppDataDocument, type AppDataState } from "./schema";

type DataChangedCallback<TKey extends keyof AppDataState> = (data: AppDataState[TKey]) => void;
type UnregisterDataChangedCallback = () => void;

export type AccountBindingResult = "unchanged" | "claimed" | "switched";

const activeDocumentOwnerKey = "app-data-document-owner";
const accountDocumentPrefix = "app-data-document:account:";

function accountDocumentKey(accountKey: string): string {
  return `${accountDocumentPrefix}${encodeURIComponent(accountKey)}`;
}

export class AppDataStore {
  private readonly callbacks: {
    [K in keyof AppDataState]: Map<number, DataChangedCallback<K>>;
  };

  private nextListenerId = 0;
  private nextDocumentListenerId = 0;
  private document: AppDataDocument;
  private readonly documentCallbacks = new Map<number, (document: AppDataDocument) => void>();
  private boundAccountKey: string | null = null;

  constructor(private readonly backend: PersistenceBackend<AppDataDocument> = new LocalStorageBackend<AppDataDocument>("app-data-document")) {
    this.document = sanitizeDocument(backend.load(createDefaultAppDataDocument()));
    this.callbacks = {
      grade: new Map<number, DataChangedCallback<"grade">>(),
      language: new Map<number, DataChangedCallback<"language">>(),
      appDisplayName: new Map<number, DataChangedCallback<"appDisplayName">>(),
      kenshiNumber: new Map<number, DataChangedCallback<"kenshiNumber">>(),
      notes: new Map<number, DataChangedCallback<"notes">>(),
      notesUpdatedAt: new Map<number, DataChangedCallback<"notesUpdatedAt">>(),
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

  // The app used to keep one device-local document regardless of who was signed in.
  // That lets signing into a second account upload the first account's data when the
  // second account has no server document yet. Claim the legacy document for the
  // first authenticated account, then keep a separate device copy per account.
  bindToAccount(accountKey: string): AccountBindingResult {
    if (this.boundAccountKey === accountKey) return "unchanged";

    const recordedOwner = localStorage.getItem(activeDocumentOwnerKey);
    if (this.boundAccountKey === null && recordedOwner === null) {
      this.boundAccountKey = accountKey;
      localStorage.setItem(activeDocumentOwnerKey, accountKey);
      this.persist(this.document);
      return "claimed";
    }

    if (this.boundAccountKey === null && recordedOwner === accountKey) {
      this.boundAccountKey = accountKey;
      const stored = localStorage.getItem(accountDocumentKey(accountKey));
      if (stored) {
        try {
          const latest = sanitizeDocument(JSON.parse(stored) as AppDataDocument);
          // A second tab may have changed the active account document after this
          // store was constructed. Start from that newer device copy instead of
          // writing this tab's stale startup snapshot over it.
          if (!deepEqual(latest, this.document)) {
            this.replaceDocument(latest);
          }
          return "unchanged";
        } catch {
          // Repair a broken scoped copy from the valid active document already
          // loaded by this store.
        }
      }
      this.persist(this.document);
      return "unchanged";
    }

    const previousAccount = this.boundAccountKey ?? recordedOwner;
    if (previousAccount) {
      localStorage.setItem(accountDocumentKey(previousAccount), JSON.stringify(this.document));
    }

    const stored = localStorage.getItem(accountDocumentKey(accountKey));
    let next = createDefaultAppDataDocument();
    if (stored) {
      try {
        next = sanitizeDocument(JSON.parse(stored) as AppDataDocument);
      } catch {
        // A broken device copy is not allowed to cross into another account. The
        // server copy will refill a clean default document during the first sync.
      }
    }

    this.boundAccountKey = accountKey;
    localStorage.setItem(activeDocumentOwnerKey, accountKey);
    this.replaceDocument(next);
    return "switched";
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

    this.persist(this.document);
    this.notify(key, value);
    this.notifyDocument();
  }

  setDocument(document: AppDataDocument): void {
    this.replaceDocument(sanitizeDocument(document));
  }

  private replaceDocument(document: AppDataDocument): void {
    const previous = this.document;
    this.document = document;
    this.persist(this.document);

    const keys = Object.keys(this.document.data) as Array<keyof AppDataState>;
    for (const key of keys) {
      if (!deepEqual(previous.data[key], this.document.data[key])) {
        this.notify(key, this.document.data[key]);
      }
    }

    this.notifyDocument();
  }

  private persist(document: AppDataDocument): void {
    if (this.boundAccountKey !== null) {
      localStorage.setItem(accountDocumentKey(this.boundAccountKey), JSON.stringify(document));
      // Another tab may have changed accounts, which changes the auth cookie for
      // every tab. Keep this tab's old-account copy, but do not replace the active
      // document now owned by the newly signed-in account.
      if (localStorage.getItem(activeDocumentOwnerKey) !== this.boundAccountKey) return;
    }
    this.backend.save(document);
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
      appDisplayName: input.data?.appDisplayName === null
        ? null
        : typeof input.data?.appDisplayName === "string"
          ? input.data.appDisplayName.slice(0, APP_DISPLAY_NAME_MAX_LENGTH)
          : fallback.data.appDisplayName,
      kenshiNumber: readKenshiNumber(input.data?.kenshiNumber),
      notes: isRecord(input.data?.notes) ? input.data.notes : fallback.data.notes,
      notesUpdatedAt: isRecord(input.data?.notesUpdatedAt) ? input.data.notesUpdatedAt : fallback.data.notesUpdatedAt,
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

import { LocalStorageBackend } from "./backend";
import { createDefaultAppDataDocument, type AppDataDocument, type AppDataState } from "./schema";

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

  constructor(private readonly backend = new LocalStorageBackend<AppDataDocument>("app-data-document")) {
    this.document = sanitizeDocument(backend.load(createDefaultAppDataDocument()));
    this.callbacks = {
      grade: new Map<number, DataChangedCallback<"grade">>(),
      language: new Map<number, DataChangedCallback<"language">>(),
      theme: new Map<number, DataChangedCallback<"theme">>(),
      currentWeekAnchor: new Map<number, DataChangedCallback<"currentWeekAnchor">>(),
      syncProvider: new Map<number, DataChangedCallback<"syncProvider">>(),
      notes: new Map<number, DataChangedCallback<"notes">>(),
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
      if (!areEqual(previous.data[key], this.document.data[key])) {
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
    const callbacks = this.callbacks[key] as Map<number, DataChangedCallback<TKey>>;

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

function areEqual<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sanitizeDocument(input: AppDataDocument): AppDataDocument {
  const fallback = createDefaultAppDataDocument();
  return {
    version: typeof input.version === "number" ? input.version : fallback.version,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : fallback.updatedAt,
    deviceId: typeof input.deviceId === "string" ? input.deviceId : fallback.deviceId,
    data: {
      grade: input.data?.grade ?? fallback.data.grade,
      language: input.data?.language ?? fallback.data.language,
      theme: input.data?.theme ?? fallback.data.theme,
      currentWeekAnchor: isWeekAnchor(input.data?.currentWeekAnchor)
        ? input.data.currentWeekAnchor
        : fallback.data.currentWeekAnchor,
      syncProvider: input.data?.syncProvider ?? fallback.data.syncProvider,
      notes: isRecord(input.data?.notes) ? input.data.notes : fallback.data.notes,
    },
  };
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

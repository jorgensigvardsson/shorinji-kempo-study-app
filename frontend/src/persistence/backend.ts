export interface PersistenceBackend<TDocument> {
  load(defaultDocument: TDocument): TDocument;
  save(document: TDocument): void;
}

export class LocalStorageBackend<TDocument> implements PersistenceBackend<TDocument> {
  constructor(private readonly storageKey: string) {}

  load(defaultDocument: TDocument): TDocument {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) {
      return defaultDocument;
    }

    try {
      return JSON.parse(raw) as TDocument;
    } catch {
      return defaultDocument;
    }
  }

  save(document: TDocument): void {
    localStorage.setItem(this.storageKey, JSON.stringify(document));
  }
}

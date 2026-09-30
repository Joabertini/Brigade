export type PendingEntry = {
  operationId: string;
  userId: string;
  kitchenId: string;
  productionId: string;
  amountMilli: number;
  recordedAt: string;
  status: "pending" | "conflict";
  error?: string;
};

const name = "brigade-cloud-cache-v1";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("cache", { keyPath: "key" });
      request.result.createObjectStore("pending", { keyPath: "operationId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function execute<T>(storeName: "cache" | "pending", mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      let result: T;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve(result);
    });
  } finally {
    db.close();
  }
}

export async function readCache<T>(key: string): Promise<T | null> {
  const row = await execute<{ key: string; value: T } | undefined>("cache", "readonly", (store) => store.get(key));
  return row?.value ?? null;
}

export async function writeCache<T>(key: string, value: T): Promise<void> {
  await execute("cache", "readwrite", (store) => store.put({ key, value }));
}

export async function clearUserCache(userId: string, kitchenId: string): Promise<void> {
  const db = await open();
  const prefix = `${userId}:${kitchenId}:`;
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("cache", "readwrite");
      const store = transaction.objectStore("cache");
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const current = cursor.result;
        if (!current) return;
        if (typeof current.key === "string" && current.key.startsWith(prefix)) current.delete();
        current.continue();
      };
      cursor.onerror = () => reject(cursor.error);
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();
    });
  } finally {
    db.close();
  }
}

export async function listPending(userId: string, kitchenId: string): Promise<PendingEntry[]> {
  const rows = await execute<PendingEntry[]>("pending", "readonly", (store) => store.getAll());
  return rows.filter((row) => row.userId === userId && row.kitchenId === kitchenId);
}

export async function putPending(row: PendingEntry): Promise<void> {
  await execute("pending", "readwrite", (store) => store.put(row));
}

export async function deletePending(operationId: string): Promise<void> {
  await execute("pending", "readwrite", (store) => store.delete(operationId));
}

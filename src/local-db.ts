import type { RecipeVersion } from "../shared/kitchen";

export interface LocalRecipe {
  id: string;
  visibility: "private" | "kitchen";
  ownerUserId?: string;
  version: RecipeVersion;
  updatedAt: string;
}

export interface LocalProduction {
  id: string;
  recipe: RecipeVersion;
  targetYieldMilli: number;
  producedYieldMilli: number;
  plannedFor: string;
  eventId?: string | null;
  entries: { id: string; amountMilli: number; at: string }[];
}

export interface LocalEvent {
  id: string;
  name: string;
  eventDate: string;
  guestCount: number | null;
  notes: string;
}

type Entity = LocalRecipe | LocalProduction | LocalEvent;
type StoreName = "recipes" | "productions" | "events";
const DATABASE_NAME = "brigade-local-v1";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("recipes")) db.createObjectStore("recipes", { keyPath: "id" });
      if (!db.objectStoreNames.contains("productions")) db.createObjectStore("productions", { keyPath: "id" });
      if (!db.objectStoreNames.contains("events")) db.createObjectStore("events", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listLocal<T extends Entity>(storeName: StoreName): Promise<T[]> {
  const db = await openDatabase();
  try {
    return await new Promise<T[]>((resolve, reject) => {
      const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function putLocal(storeName: StoreName, entity: Entity): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put(entity);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

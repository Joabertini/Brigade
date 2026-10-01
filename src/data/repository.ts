import type { RecipeVersion } from "../../shared/kitchen";
import type { IngredientNeed, UnlinkedNeed } from "../../shared/requirements";
import type { RecipeDraft } from "../../shared/capture";
import { cleanCourse, courseKey, mergeCourses } from "../../shared/courses";
import { listLocal, putLocal, type LocalEvent, type LocalProduction, type LocalRecipe } from "../local-db";
import { deletePending, listPending, putPending, readCache, writeCache, type PendingEntry } from "./cloud-cache";
import starterRecipes from "./bbchef-starter.json";

export type Identity = { user: { id: string; name: string; email: string }; kitchenId: string; role: "chef" | "sous_chef" | "commis" };

export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export function isAccessError(cause: unknown): cause is ApiError {
  return cause instanceof ApiError && (cause.status === 401 || cause.status === 403);
}

export type StockUnit = "g" | "ml" | "un" | "atado" | "paq" | "bandeja";
export type CatalogIngredient = { id: string; name: string; baseUnit: StockUnit; availableMilli: number };
export type StockMovement = { operationId: string; ingredientId: string; ingredientName: string; deltaMilli: number; baseUnit: StockUnit; kind: "received" | "consumed" | "adjustment"; note: string; recordedAt: string };
export type Supplier = { id: string; name: string; contact: string };
export type PurchaseLine = { id: string; ingredientId: string; ingredientName: string; quantityMilli: number; receivedMilli: number; unit: StockUnit; note: string };
export type PurchaseOrder = { id: string; supplierId: string; supplierName: string; supplierContact: string; status: "draft" | "sent" | "confirmed" | "received" | "cancelled"; sentAt: string | null; createdAt: string; note: string; lines: PurchaseLine[] };

export type Requirements = { needs: IngredientNeed[]; unlinked: UnlinkedNeed[] };

export interface KitchenRepository {
  listRecipes(): Promise<LocalRecipe[]>;
  createRecipe(version: RecipeVersion, course: string | null): Promise<void>;
  listCourses(): Promise<string[]>;
  addCourse(name: string): Promise<string[]>;
  setRecipeCourse(recipe: LocalRecipe, course: string | null): Promise<void>;
  listProductions(recipes: LocalRecipe[]): Promise<LocalProduction[]>;
  planProduction(recipe: LocalRecipe, targetYieldMilli: number, plannedFor: string, eventId?: string): Promise<void>;
  recordBatch(production: LocalProduction, amountMilli: number): Promise<void>;
  pendingEntries(): Promise<PendingEntry[]>;
  syncPending(): Promise<void>;
  listMembers(): Promise<{ id: string; name: string; email?: string; role: string }[]>;
  shareRecipe(recipeId: string, userId: string): Promise<void>;
  setRecipeVisibility(recipeId: string, visibility: "private" | "kitchen"): Promise<void>;
  inviteMember(email: string, role: Identity["role"]): Promise<{ token: string; expiresAt: string }>;
  listEvents(): Promise<LocalEvent[]>;
  saveEvent(event: LocalEvent): Promise<void>;
  listIngredients(): Promise<CatalogIngredient[]>;
  createIngredient(name: string, baseUnit: StockUnit): Promise<void>;
  listStockMovements(): Promise<StockMovement[]>;
  recordStockMovement(ingredientId: string, deltaMilli: number, kind: StockMovement["kind"], note: string): Promise<void>;
  listSuppliers(): Promise<Supplier[]>;
  createSupplier(name: string, contact: string): Promise<void>;
  listOrders(): Promise<PurchaseOrder[]>;
  createOrder(supplierId: string, lines: { ingredientId: string; quantityMilli: number; note: string }[], note: string, orderId: string): Promise<void>;
  setOrderStatus(orderId: string, status: "sent" | "confirmed" | "cancelled"): Promise<void>;
  receiveOrder(orderId: string, lines: { lineId: string; quantityMilli: number }[], operationId: string): Promise<void>;
  listRequirements(): Promise<Requirements>;
  linkIngredient(recipeId: string, ingredientId: string, catalogIngredientId: string | null): Promise<void>;
  interpretRecipe(text: string): Promise<RecipeDraft>;
  transcribeRecipe(image: string): Promise<string>;
}

export class LocalRepository implements KitchenRepository {
  async listRecipes() {
    const own = await listLocal<LocalRecipe>("recipes");
    const ownIds = new Set(own.map((recipe) => recipe.id));
    return [...own, ...starterRecipes.filter((recipe) => !ownIds.has(recipe.id)) as LocalRecipe[]];
  }
  async createRecipe(version: RecipeVersion, course: string | null) {
    await putLocal("recipes", {
      id: version.recipeId, visibility: "private", course, version, updatedAt: new Date().toISOString(),
    });
  }
  private customCourses(): string[] {
    try { return JSON.parse(localStorage.getItem("brigade-courses") ?? "[]") as string[]; } catch { return []; }
  }
  listCourses() { return Promise.resolve(mergeCourses(this.customCourses())); }
  async addCourse(name: string) {
    const clean = cleanCourse(name);
    if (!clean) throw new Error("Escribí un nombre de hasta 60 caracteres");
    const courses = mergeCourses(this.customCourses());
    if (courses.some((course) => courseKey(course) === courseKey(clean))) throw new Error("Ese curso ya existe");
    localStorage.setItem("brigade-courses", JSON.stringify([...this.customCourses(), clean]));
    return [...courses, clean];
  }
  async setRecipeCourse(recipe: LocalRecipe, course: string | null) {
    await putLocal("recipes", { ...recipe, course, updatedAt: new Date().toISOString() });
  }
  listProductions() { return listLocal<LocalProduction>("productions"); }
  async planProduction(recipe: LocalRecipe, targetYieldMilli: number, plannedFor: string, eventId?: string) {
    await putLocal("productions", {
      id: crypto.randomUUID(), recipe: structuredClone(recipe.version), targetYieldMilli,
      producedYieldMilli: 0, plannedFor, eventId: eventId || null, entries: [],
    });
  }
  async recordBatch(production: LocalProduction, amountMilli: number) {
    await putLocal("productions", {
      ...production, producedYieldMilli: production.producedYieldMilli + amountMilli,
      entries: [...production.entries, { id: crypto.randomUUID(), amountMilli, at: new Date().toISOString() }],
    });
  }
  pendingEntries() { return Promise.resolve([]); }
  syncPending() { return Promise.resolve(); }
  listMembers() { return Promise.resolve([]); }
  shareRecipe() { return Promise.reject(new Error("Conectá tu cocina para compartir")); }
  setRecipeVisibility() { return Promise.reject(new Error("Conectá tu cocina para compartir")); }
  inviteMember() { return Promise.reject(new Error("Conectá tu cocina para invitar")); }
  listEvents() { return listLocal<LocalEvent>("events"); }
  async saveEvent(event: LocalEvent) { await putLocal("events", { ...event, id: event.id || crypto.randomUUID() }); }
  listIngredients() { return Promise.resolve([]); }
  createIngredient() { return Promise.reject(new Error("Conectá tu cocina para administrar stock")); }
  listStockMovements() { return Promise.resolve([]); }
  recordStockMovement() { return Promise.reject(new Error("Conectá tu cocina para registrar stock")); }
  listSuppliers() { return Promise.resolve([]); }
  createSupplier() { return Promise.reject(new Error("Conectá tu cocina para administrar proveedores")); }
  listOrders() { return Promise.resolve([]); }
  createOrder() { return Promise.reject(new Error("Conectá tu cocina para preparar pedidos")); }
  setOrderStatus() { return Promise.reject(new Error("Conectá tu cocina para actualizar pedidos")); }
  receiveOrder() { return Promise.reject(new Error("Conectá tu cocina para recibir pedidos")); }
  listRequirements() { return Promise.resolve({ needs: [], unlinked: [] }); }
  linkIngredient() { return Promise.reject(new Error("Conectá tu cocina para vincular stock")); }
  interpretRecipe(): Promise<RecipeDraft> { return Promise.reject(new Error("Conectá tu cocina para interpretar recetas")); }
  transcribeRecipe(): Promise<string> { return Promise.reject(new Error("Conectá tu cocina para leer fotos")); }
}

type RecipeSummary = { id: string; version_id: string; visibility: "private" | "kitchen"; owner_user_id: string; course: string | null };
type ProductionSummary = {
  id: string; recipe_version_id: string; title: string; version: number; yield_unit: RecipeVersion["yieldUnit"];
  target_yield_milli: number; produced_yield_milli: number; planned_for: string | null; event_id: string | null;
};

export class CloudRepository implements KitchenRepository {
  constructor(private readonly identity: Identity) {}
  private root() { return `/api/kitchens/${this.identity.kitchenId}`; }
  private cacheKey(kind: string) { return `${this.identity.user.id}:${this.identity.kitchenId}:${kind}`; }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(path, { credentials: "same-origin", ...options });
    if (!response.ok) {
      const message = await response.text();
      throw new ApiError(response.status, `Servidor ${response.status}: ${message.slice(0, 180)}`);
    }
    return response.json() as Promise<T>;
  }

  async listRecipes(): Promise<LocalRecipe[]> {
    const key = this.cacheKey("recipes");
    try {
      const summaries = await this.request<{ recipes: RecipeSummary[] }>(`${this.root()}/recipes`);
      const recipes = await Promise.all(summaries.recipes.map(async (summary) => {
        const detail = await this.request<{ version: RecipeVersion }>(`${this.root()}/recipes/${summary.id}`);
        return {
          id: summary.id, visibility: summary.visibility, version: detail.version,
          ownerUserId: summary.owner_user_id, course: summary.course, updatedAt: new Date().toISOString(),
        } satisfies LocalRecipe;
      }));
      await writeCache(key, recipes);
      return recipes;
    } catch (cause) {
      if (isAccessError(cause)) throw cause;
      return (await readCache<LocalRecipe[]>(key)) ?? [];
    }
  }

  async listCourses(): Promise<string[]> {
    const key = this.cacheKey("courses");
    try {
      const result = await this.request<{ courses: string[] }>(`${this.root()}/courses`);
      await writeCache(key, result.courses);
      return result.courses;
    } catch (cause) {
      if (isAccessError(cause)) throw cause;
      return (await readCache<string[]>(key)) ?? mergeCourses([]);
    }
  }

  async addCourse(name: string): Promise<string[]> {
    const result = await this.request<{ courses: string[] }>(`${this.root()}/courses`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }),
    });
    return result.courses;
  }

  async setRecipeCourse(recipe: LocalRecipe, course: string | null): Promise<void> {
    await this.request(`${this.root()}/recipes/${recipe.id}/course`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ course }),
    });
  }

  async createRecipe(version: RecipeVersion, course: string | null): Promise<void> {
    if (!navigator.onLine) throw new Error("Conectate para guardar una receta compartible. Este formulario sigue abierto.");
    const ingredientIndexes = new Map(version.ingredients.map((ingredient, index) => [ingredient.id, index]));
    await this.request(`${this.root()}/recipes`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: version.title, description: version.description, yieldMilli: version.yieldMilli,
        yieldUnit: version.yieldUnit, course,
        ingredients: version.ingredients.map(({ name, netMilli, unit, wastePermille, catalogIngredientId }) => ({ name, netMilli, unit, wastePermille, catalogIngredientId: catalogIngredientId ?? null })),
        steps: version.steps.map(({ title, instruction, ingredientIds }) => ({
          title, instruction, ingredientIndexes: ingredientIds.map((id) => ingredientIndexes.get(id)).filter((index): index is number => index !== undefined),
        })),
      }),
    });
  }

  async listProductions(recipes: LocalRecipe[]): Promise<LocalProduction[]> {
    const key = this.cacheKey("productions");
    let items: LocalProduction[] | null = null;
    try {
        const response = await this.request<{ productions: ProductionSummary[] }>(`${this.root()}/productions`);
        items = await Promise.all(response.productions.map(async (row) => {
          const known = recipes.find((recipe) => recipe.version.id === row.recipe_version_id);
          const previous = (await readCache<LocalProduction[]>(key))?.find((entry) => entry.id === row.id);
          const recipe = known?.version ?? previous?.recipe ?? {
            id: row.recipe_version_id, recipeId: "", version: row.version, title: row.title, description: "",
            yieldMilli: row.target_yield_milli, yieldUnit: row.yield_unit, ingredients: [], steps: [], confirmedByChef: true,
          };
          const history = await this.request<{ entries: { operation_id: string; amount_milli: number; recorded_at: string }[] }>(
            `${this.root()}/productions/${row.id}/entries`,
          );
          return {
            id: row.id, recipe, targetYieldMilli: row.target_yield_milli,
            producedYieldMilli: row.produced_yield_milli, plannedFor: row.planned_for ?? "", eventId: row.event_id,
            entries: history.entries.map((entry) => ({ id: entry.operation_id, amountMilli: entry.amount_milli, at: entry.recorded_at })),
          } satisfies LocalProduction;
        }));
        await writeCache(key, items);
    } catch (cause) {
      if (isAccessError(cause)) throw cause;
      /* use the last synchronized view after a network failure */
    }
    items ??= (await readCache<LocalProduction[]>(key)) ?? [];
    const pending = await this.pendingEntries();
    return items.map((item) => {
      const ownPending = pending.filter((entry) => entry.productionId === item.id && entry.status === "pending");
      return {
        ...item, producedYieldMilli: item.producedYieldMilli + ownPending.reduce((sum, entry) => sum + entry.amountMilli, 0),
        entries: [...item.entries, ...ownPending.map((entry) => ({ id: entry.operationId, amountMilli: entry.amountMilli, at: entry.recordedAt }))],
      };
    });
  }

  async planProduction(recipe: LocalRecipe, targetYieldMilli: number, plannedFor: string, eventId?: string): Promise<void> {
    await this.request(`${this.root()}/productions`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipeVersionId: recipe.version.id, targetYieldMilli, plannedFor, eventId: eventId || null }),
    });
  }

  async recordBatch(production: LocalProduction, amountMilli: number): Promise<void> {
    await putPending({
      operationId: crypto.randomUUID(), userId: this.identity.user.id, kitchenId: this.identity.kitchenId,
      productionId: production.id, amountMilli, recordedAt: new Date().toISOString(), status: "pending",
    });
    await this.syncPending();
  }

  pendingEntries() { return listPending(this.identity.user.id, this.identity.kitchenId); }

  async listMembers() {
    const result = await this.request<{ members: { id: string; name: string; email?: string; role: string }[] }>(`${this.root()}/members`);
    return result.members;
  }

  async shareRecipe(recipeId: string, userId: string): Promise<void> {
    await this.request(`${this.root()}/recipes/${recipeId}/access`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId }),
    });
  }

  async setRecipeVisibility(recipeId: string, visibility: "private" | "kitchen"): Promise<void> {
    await this.request(`${this.root()}/recipes/${recipeId}/sharing`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ visibility }),
    });
  }

  inviteMember(email: string, role: Identity["role"]) {
    return this.request<{ token: string; expiresAt: string }>(`${this.root()}/invitations`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, role }),
    });
  }

  async listEvents(): Promise<LocalEvent[]> {
    const key = this.cacheKey("events");
    try {
      const result = await this.request<{ events: {
        id: string; name: string; event_date: string; guest_count: number | null; notes: string;
      }[] }>(`${this.root()}/events`);
      const events = result.events.map((event) => ({
        id: event.id, name: event.name, eventDate: event.event_date,
        guestCount: event.guest_count, notes: event.notes,
      }));
      await writeCache(key, events);
      return events;
    } catch (cause) {
      if (isAccessError(cause)) throw cause;
      return (await readCache<LocalEvent[]>(key)) ?? [];
    }
  }

  async saveEvent(event: LocalEvent): Promise<void> {
    const path = event.id ? `${this.root()}/events/${event.id}` : `${this.root()}/events`;
    await this.request(path, {
      method: event.id ? "PUT" : "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    });
  }

  async listIngredients(): Promise<CatalogIngredient[]> {
    const key = this.cacheKey("ingredients");
    try {
      const result = await this.request<{ ingredients: { id: string; name: string; base_unit: StockUnit; available_milli: number }[] }>(`${this.root()}/ingredients`);
      const ingredients = result.ingredients.map((row) => ({ id: row.id, name: row.name, baseUnit: row.base_unit, availableMilli: row.available_milli }));
      await writeCache(key, ingredients);
      return ingredients;
    } catch (cause) {
      if (isAccessError(cause)) throw cause;
      return (await readCache<CatalogIngredient[]>(key)) ?? [];
    }
  }

  async createIngredient(name: string, baseUnit: StockUnit): Promise<void> {
    await this.request(`${this.root()}/ingredients`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, baseUnit }),
    });
  }

  async listStockMovements(): Promise<StockMovement[]> {
    const key = this.cacheKey("movements");
    try {
      const result = await this.request<{ movements: {
        operation_id: string; ingredient_id: string; ingredient_name: string; delta_milli: number;
        base_unit: StockUnit; kind: StockMovement["kind"]; note: string; recorded_at: string;
      }[] }>(`${this.root()}/stock/movements`);
      const movements = result.movements.map((row) => ({
        operationId: row.operation_id, ingredientId: row.ingredient_id, ingredientName: row.ingredient_name,
        deltaMilli: row.delta_milli, baseUnit: row.base_unit, kind: row.kind, note: row.note, recordedAt: row.recorded_at,
      }));
      await writeCache(key, movements);
      return movements;
    } catch (cause) {
      if (isAccessError(cause)) throw cause;
      return (await readCache<StockMovement[]>(key)) ?? [];
    }
  }

  async recordStockMovement(ingredientId: string, deltaMilli: number, kind: StockMovement["kind"], note: string): Promise<void> {
    if (!navigator.onLine) throw new Error("Conectate para registrar este movimiento de stock.");
    await this.request(`${this.root()}/stock/movements`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ operationId: crypto.randomUUID(), ingredientId, deltaMilli, kind, note, recordedAt: new Date().toISOString() }),
    });
  }

  async listSuppliers(): Promise<Supplier[]> {
    const key = this.cacheKey("suppliers");
    try {
      const result = await this.request<{ suppliers: Supplier[] }>(`${this.root()}/suppliers`);
      await writeCache(key, result.suppliers);
      return result.suppliers;
    } catch (cause) {
      if (isAccessError(cause)) throw cause;
      return (await readCache<Supplier[]>(key)) ?? [];
    }
  }

  async createSupplier(name: string, contact: string): Promise<void> {
    await this.request(`${this.root()}/suppliers`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, contact }),
    });
  }

  async listOrders(): Promise<PurchaseOrder[]> {
    const key = this.cacheKey("orders");
    try {
      const result = await this.request<{ orders: {
        id: string; supplier_id: string; supplier_name: string; supplier_contact: string;
        status: PurchaseOrder["status"]; sent_at: string | null; created_at: string; note: string;
        lines: { id: string; catalog_ingredient_id: string; ingredient_name: string; quantity_milli: number; received_milli: number; unit: StockUnit; note: string }[];
      }[] }>(`${this.root()}/orders`);
      const orders = result.orders.map((row) => ({
        id: row.id, supplierId: row.supplier_id, supplierName: row.supplier_name,
        supplierContact: row.supplier_contact, status: row.status, sentAt: row.sent_at,
        createdAt: row.created_at, note: row.note,
        lines: row.lines.map((line) => ({
          id: line.id, ingredientId: line.catalog_ingredient_id, ingredientName: line.ingredient_name,
          quantityMilli: line.quantity_milli, receivedMilli: line.received_milli, unit: line.unit, note: line.note,
        })),
      }));
      await writeCache(key, orders);
      return orders;
    } catch (cause) {
      if (isAccessError(cause)) throw cause;
      return (await readCache<PurchaseOrder[]>(key)) ?? [];
    }
  }

  async createOrder(supplierId: string, lines: { ingredientId: string; quantityMilli: number; note: string }[], note: string, orderId: string): Promise<void> {
    await this.request(`${this.root()}/orders`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ supplierId, lines, note, orderId }),
    });
  }

  async setOrderStatus(orderId: string, status: "sent" | "confirmed" | "cancelled"): Promise<void> {
    await this.request(`${this.root()}/orders/${orderId}/status`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }),
    });
  }

  async receiveOrder(orderId: string, lines: { lineId: string; quantityMilli: number }[], operationId: string): Promise<void> {
    await this.request(`${this.root()}/orders/${orderId}/receipts`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operationId, lines }),
    });
  }

  async listRequirements(): Promise<Requirements> {
    const key = this.cacheKey("requirements");
    try {
      const result = await this.request<Requirements>(`${this.root()}/requirements`);
      await writeCache(key, result);
      return result;
    } catch (cause) {
      if (isAccessError(cause)) throw cause;
      return (await readCache<Requirements>(key)) ?? { needs: [], unlinked: [] };
    }
  }

  async linkIngredient(recipeId: string, ingredientId: string, catalogIngredientId: string | null): Promise<void> {
    await this.request(`${this.root()}/recipes/${recipeId}/ingredients/${ingredientId}/catalog`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ catalogIngredientId }),
    });
  }

  async interpretRecipe(text: string): Promise<RecipeDraft> {
    if (!navigator.onLine) throw new Error("Sin conexión. La interpretación necesita red.");
    const result = await this.request<{ draft: RecipeDraft }>(`${this.root()}/recipes/interpret`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }),
    });
    return result.draft;
  }

  async transcribeRecipe(image: string): Promise<string> {
    if (!navigator.onLine) throw new Error("Sin conexión. Leer la foto necesita red.");
    const result = await this.request<{ text: string }>(`${this.root()}/recipes/transcribe`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image }),
    });
    return result.text;
  }

  async syncPending(): Promise<void> {
    for (const entry of await this.pendingEntries()) {
      if (entry.status !== "pending") continue;
      try {
        await this.request(`${this.root()}/productions/${entry.productionId}/entries`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ operationId: entry.operationId, amountMilli: entry.amountMilli, recordedAt: entry.recordedAt }),
        });
        await deletePending(entry.operationId);
      } catch (cause) {
        if (isAccessError(cause) && cause.status === 401) throw cause;
        const message = cause instanceof Error ? cause.message : "No se pudo sincronizar";
        if (/Servidor (403|404|409):/.test(message)) await putPending({ ...entry, status: "conflict", error: message });
        else break;
      }
    }
  }
}

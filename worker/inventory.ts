import type { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AuthBindings } from "./auth";
import { requireManager, requireMember } from "./permissions";

type App = Hono<{ Bindings: AuthBindings }>;
const baseUnits = new Set(["g", "ml", "un", "atado", "paq", "bandeja"]);
type MovementInput = { operationId?: string; ingredientId?: string; deltaMilli?: number; kind?: string; note?: string; recordedAt?: string };

export function registerInventoryRoutes(app: App) {
  app.get("/api/kitchens/:kitchenId/ingredients", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    await requireMember(context, kitchenId);
    const result = await context.env.DB.prepare(
      `SELECT i.id, i.name, i.base_unit,
        COALESCE(SUM(m.delta_milli), 0) AS available_milli
       FROM catalog_ingredients i LEFT JOIN stock_movements m ON m.ingredient_id = i.id
       WHERE i.kitchen_id = ? AND i.archived_at IS NULL
       GROUP BY i.id ORDER BY i.name COLLATE NOCASE`,
    ).bind(kitchenId).all();
    return context.json({ ingredients: result.results });
  });

  app.post("/api/kitchens/:kitchenId/ingredients", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    const actor = await requireMember(context, kitchenId);
    requireManager(actor.role);
    let body: { name?: string; baseUnit?: string };
    try { body = await context.req.json(); } catch { throw new HTTPException(400, { message: "JSON inválido" }); }
    const name = body.name?.trim() ?? "";
    if (!name || name.length > 200 || !baseUnits.has(body.baseUnit ?? "")) {
      throw new HTTPException(400, { message: "Ingrediente o unidad inválidos" });
    }
    const id = crypto.randomUUID();
    try {
      await context.env.DB.prepare(
        "INSERT INTO catalog_ingredients (id, kitchen_id, name, base_unit) VALUES (?, ?, ?, ?)",
      ).bind(id, kitchenId, name, body.baseUnit).run();
    } catch {
      throw new HTTPException(409, { message: "Ya existe un ingrediente con ese nombre" });
    }
    return context.json({ id, name, baseUnit: body.baseUnit }, 201);
  });

  app.get("/api/kitchens/:kitchenId/stock/movements", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    await requireMember(context, kitchenId);
    const result = await context.env.DB.prepare(
      `SELECT m.operation_id, m.ingredient_id, i.name AS ingredient_name, m.delta_milli,
        i.base_unit, m.kind, m.note, m.actor_user_id, m.recorded_at
       FROM stock_movements m JOIN catalog_ingredients i ON i.id = m.ingredient_id
       WHERE m.kitchen_id = ? ORDER BY m.created_at DESC LIMIT 100`,
    ).bind(kitchenId).all();
    return context.json({ movements: result.results });
  });

  app.post("/api/kitchens/:kitchenId/stock/movements", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    const actor = await requireMember(context, kitchenId);
    requireManager(actor.role);
    let body: MovementInput;
    try { body = await context.req.json(); } catch { throw new HTTPException(400, { message: "JSON inválido" }); }
    const operationId = body.operationId ?? "";
    const ingredientId = body.ingredientId ?? "";
    const delta = body.deltaMilli;
    const kind = body.kind ?? "";
    const note = body.note?.trim() ?? "";
    const recordedAt = body.recordedAt ?? new Date().toISOString();
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(operationId) || !ingredientId ||
      !Number.isSafeInteger(delta) || delta === 0 ||
      !["received", "consumed", "adjustment"].includes(kind) ||
      (kind === "received" && delta! < 0) || (kind === "consumed" && delta! > 0) ||
      note.length > 1000 || !Number.isFinite(Date.parse(recordedAt))) {
      throw new HTTPException(400, { message: "Movimiento inválido" });
    }
    const previous = await context.env.DB.prepare(
      "SELECT ingredient_id, delta_milli, kind, note FROM stock_movements WHERE operation_id = ? AND kitchen_id = ?",
    ).bind(operationId, kitchenId).first<{ ingredient_id: string; delta_milli: number; kind: string; note: string }>();
    if (previous) {
      if (previous.ingredient_id !== ingredientId || previous.delta_milli !== delta || previous.kind !== kind || previous.note !== note) {
        throw new HTTPException(409, { message: "El identificador ya se usó para otro movimiento" });
      }
      return context.json({ operationId, repeated: true });
    }
    const ingredient = await context.env.DB.prepare(
      "SELECT id FROM catalog_ingredients WHERE id = ? AND kitchen_id = ? AND archived_at IS NULL",
    ).bind(ingredientId, kitchenId).first();
    if (!ingredient) throw new HTTPException(404, { message: "Ingrediente no encontrado" });
    try {
      await context.env.DB.prepare(
        `INSERT INTO stock_movements
         (operation_id, kitchen_id, ingredient_id, delta_milli, kind, note, actor_user_id, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(operationId, kitchenId, ingredientId, delta, kind, note, actor.userId, recordedAt).run();
    } catch {
      throw new HTTPException(409, { message: "Movimiento duplicado o stock insuficiente" });
    }
    return context.json({ operationId, repeated: false }, 201);
  });
}

import type { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { assertPositiveMilli, compatibleStockUnit, scaleIngredient, toStockMilli, type StockUnit, type Unit } from "../shared/kitchen";
import type { AuthBindings } from "./auth";
import { requireManager, requireMember } from "./permissions";

type App = Hono<{ Bindings: AuthBindings }>;

export function registerProductionRoutes(app: App) {
  app.get("/api/kitchens/:kitchenId/productions", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    const actor = await requireMember(context, kitchenId);
    const rows = await context.env.DB.prepare(
      `SELECT p.id, p.target_yield_milli, p.produced_yield_milli, p.planned_for, p.status,
        v.id AS recipe_version_id, v.version, v.yield_unit, r.title, p.event_id
       FROM productions p
       JOIN recipe_versions v ON v.id = p.recipe_version_id
       JOIN recipes r ON r.id = v.recipe_id
       WHERE p.kitchen_id = ?
         AND (r.owner_user_id = ? OR r.visibility = 'kitchen'
           OR EXISTS (SELECT 1 FROM recipe_access a WHERE a.recipe_id = r.id AND a.user_id = ?))
       ORDER BY p.planned_for DESC, p.created_at DESC`,
    ).bind(kitchenId, actor.userId, actor.userId).all();
    return context.json({ productions: rows.results });
  });

  app.post("/api/kitchens/:kitchenId/productions", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    const actor = await requireMember(context, kitchenId);
    requireManager(actor.role);
    let body: { recipeVersionId?: string; targetYieldMilli?: number; plannedFor?: string; eventId?: string | null };
    try { body = await context.req.json(); } catch { throw new HTTPException(400, { message: "JSON inválido" }); }
    if (!body.recipeVersionId) throw new HTTPException(400, { message: "Versión de receta requerida" });
    try { assertPositiveMilli(body.targetYieldMilli!, "Rendimiento objetivo"); } catch {
      throw new HTTPException(400, { message: "Rendimiento objetivo inválido" });
    }
    if (body.plannedFor && !/^\d{4}-\d{2}-\d{2}$/.test(body.plannedFor)) throw new HTTPException(400, { message: "Fecha inválida" });
    const version = await context.env.DB.prepare(
      `SELECT v.id FROM recipe_versions v JOIN recipes r ON r.id = v.recipe_id
       WHERE v.id = ? AND r.kitchen_id = ? AND r.archived_at IS NULL
         AND (r.owner_user_id = ? OR r.visibility = 'kitchen'
           OR EXISTS (SELECT 1 FROM recipe_access a WHERE a.recipe_id = r.id AND a.user_id = ?))`,
    ).bind(body.recipeVersionId, kitchenId, actor.userId, actor.userId).first();
    if (!version) throw new HTTPException(404, { message: "Receta no disponible" });
    if (body.eventId) {
      const event = await context.env.DB.prepare("SELECT 1 FROM events WHERE id = ? AND kitchen_id = ?")
        .bind(body.eventId, kitchenId).first();
      if (!event) throw new HTTPException(400, { message: "Evento no pertenece a la cocina" });
    }
    const id = crypto.randomUUID();
    await context.env.DB.prepare(
      "INSERT INTO productions (id, kitchen_id, recipe_version_id, target_yield_milli, planned_for, event_id, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, kitchenId, body.recipeVersionId, body.targetYieldMilli, body.plannedFor || null, body.eventId || null, actor.userId).run();
    return context.json({ id }, 201);
  });

  app.get("/api/kitchens/:kitchenId/productions/:productionId/entries", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    const actor = await requireMember(context, kitchenId);
    const productionId = context.req.param("productionId");
    const visible = await context.env.DB.prepare(
      `SELECT p.id FROM productions p
       JOIN recipe_versions v ON v.id = p.recipe_version_id
       JOIN recipes r ON r.id = v.recipe_id
       WHERE p.id = ? AND p.kitchen_id = ?
         AND (r.owner_user_id = ? OR r.visibility = 'kitchen'
           OR EXISTS (SELECT 1 FROM recipe_access a WHERE a.recipe_id = r.id AND a.user_id = ?))`,
    ).bind(productionId, kitchenId, actor.userId, actor.userId).first();
    if (!visible) throw new HTTPException(404, { message: "Producción no encontrada" });
    const rows = await context.env.DB.prepare(
      "SELECT operation_id, amount_milli, recorded_at FROM production_entries WHERE production_id = ? ORDER BY recorded_at DESC",
    ).bind(productionId).all();
    return context.json({ entries: rows.results });
  });

  app.post("/api/kitchens/:kitchenId/productions/:productionId/entries", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    const productionId = context.req.param("productionId");
    const actor = await requireMember(context, kitchenId);
    const production = await context.env.DB.prepare(
      `SELECT p.id, p.status, p.produced_yield_milli, p.recipe_version_id, v.yield_milli
       FROM productions p JOIN recipe_versions v ON v.id = p.recipe_version_id WHERE p.id = ? AND p.kitchen_id = ?`,
    ).bind(productionId, kitchenId).first<{ id: string; status: string; produced_yield_milli: number; recipe_version_id: string; yield_milli: number }>();
    if (!production) throw new HTTPException(404, { message: "Producción no encontrada" });
    if (actor.role === "commis") {
      const assigned = await context.env.DB.prepare(
        "SELECT 1 FROM tasks WHERE production_id = ? AND assignee_user_id = ? AND status != 'cancelled'",
      ).bind(productionId, actor.userId).first();
      if (!assigned) throw new HTTPException(403, { message: "Esta producción no está asignada" });
    }
    let body: { operationId?: string; amountMilli?: number; recordedAt?: string };
    try { body = await context.req.json(); } catch { throw new HTTPException(400, { message: "JSON inválido" }); }
    if (!body.operationId || !/^[0-9a-f-]{36}$/i.test(body.operationId)) throw new HTTPException(400, { message: "operationId inválido" });
    try { assertPositiveMilli(body.amountMilli!, "Cantidad producida"); } catch {
      throw new HTTPException(400, { message: "Cantidad inválida" });
    }
    if (!body.recordedAt || !Number.isFinite(Date.parse(body.recordedAt))) throw new HTTPException(400, { message: "Fecha de registro inválida" });
    const existing = await context.env.DB.prepare(
      "SELECT production_id, actor_user_id, amount_milli FROM production_entries WHERE operation_id = ?",
    ).bind(body.operationId).first<{ production_id: string; actor_user_id: string; amount_milli: number }>();
    if (existing) {
      if (existing.production_id !== productionId || existing.actor_user_id !== actor.userId || existing.amount_milli !== body.amountMilli) {
        throw new HTTPException(409, { message: "operationId ya usado para otra operación" });
      }
      return context.json({ operationId: body.operationId, duplicate: true, producedYieldMilli: production.produced_yield_milli });
    }
    if (production.status === "completed" || production.status === "cancelled") throw new HTTPException(409, { message: "Producción cerrada" });
    // Each batch consumes the gross amount of every stock-linked ingredient, in the same D1 batch as the entry.
    // Movement IDs derive from the entry, so a replayed offline batch cannot consume twice. Recorded stock never
    // goes below zero: the batch happened in the kitchen, so a short register is clamped instead of rejected.
    const linked = await context.env.DB.prepare(
      `SELECT ri.id, ri.ingredient_name, ri.net_milli, ri.unit, ri.waste_permille, c.id AS catalog_id, c.base_unit
       FROM recipe_ingredients ri JOIN catalog_ingredients c ON c.id = ri.catalog_ingredient_id AND c.kitchen_id = ?
       WHERE ri.version_id = ?`,
    ).bind(kitchenId, production.recipe_version_id).all<{
      id: string; ingredient_name: string; net_milli: number; unit: Unit; waste_permille: number; catalog_id: string; base_unit: StockUnit;
    }>();
    const consumption = linked.results.filter((row) => compatibleStockUnit(row.unit, row.base_unit)).map((row) => {
      const scaled = scaleIngredient({ id: row.id, name: row.ingredient_name, netMilli: row.net_milli, unit: row.unit, wastePermille: row.waste_permille },
        production.yield_milli, body.amountMilli!);
      return { catalogId: row.catalog_id, milli: toStockMilli(scaled.requiredGrossMilli, row.unit, row.base_unit), ingredientId: row.id };
    }).filter((row) => row.milli > 0);
    const now = new Date().toISOString();
    const [insertion] = await context.env.DB.batch([
      context.env.DB.prepare(
        "INSERT OR IGNORE INTO production_entries (operation_id, production_id, actor_user_id, amount_milli, recorded_at) VALUES (?, ?, ?, ?, ?)",
      ).bind(body.operationId, productionId, actor.userId, body.amountMilli, body.recordedAt),
      ...consumption.map((row) => context.env.DB.prepare(
        `INSERT OR IGNORE INTO stock_movements (operation_id, kitchen_id, ingredient_id, delta_milli, kind, note, actor_user_id, recorded_at)
         SELECT ?, ?, ?, -MIN(?, balance), 'consumed', ?, ?, ? FROM
           (SELECT COALESCE(SUM(delta_milli), 0) AS balance FROM stock_movements WHERE ingredient_id = ?)
         WHERE balance > 0`,
      ).bind(`${body.operationId}:${row.ingredientId}`, kitchenId, row.catalogId, row.milli, `Producción ${productionId}`, actor.userId, now, row.catalogId)),
    ]);
    if (insertion.meta.changes === 0) {
      const saved = await context.env.DB.prepare(
        "SELECT production_id, actor_user_id, amount_milli FROM production_entries WHERE operation_id = ?",
      ).bind(body.operationId).first<{ production_id: string; actor_user_id: string; amount_milli: number }>();
      if (!saved || saved.production_id !== productionId || saved.actor_user_id !== actor.userId || saved.amount_milli !== body.amountMilli) {
        throw new HTTPException(409, { message: "operationId ya usado para otra operación" });
      }
    }
    const current = await context.env.DB.prepare("SELECT produced_yield_milli FROM productions WHERE id = ?")
      .bind(productionId).first<{ produced_yield_milli: number }>();
    const duplicate = insertion.meta.changes === 0;
    return context.json({ operationId: body.operationId, duplicate, producedYieldMilli: current?.produced_yield_milli }, duplicate ? 200 : 201);
  });
}

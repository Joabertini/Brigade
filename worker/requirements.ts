import type { Hono } from "hono";
import { compatibleStockUnit, scaleIngredient, toStockMilli, type StockUnit, type Unit } from "../shared/kitchen";
import { summarizeRequirements, type RequirementRow } from "../shared/requirements";
import type { AuthBindings } from "./auth";
import { requireManager, requireMember } from "./permissions";

type App = Hono<{ Bindings: AuthBindings }>;
type Row = {
  production_id: string; title: string; target_yield_milli: number; produced_yield_milli: number; yield_milli: number;
  ingredient_id: string; ingredient_name: string; net_milli: number; unit: Unit; waste_permille: number;
  catalog_ingredient_id: string | null; catalog_name: string | null; base_unit: StockUnit | null;
};

export function registerRequirementRoutes(app: App) {
  app.get("/api/kitchens/:kitchenId/requirements", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    const actor = await requireMember(context, kitchenId);
    requireManager(actor.role);
    const [rows, stock, incoming] = await Promise.all([
      context.env.DB.prepare(
        `SELECT p.id AS production_id, r.title, p.target_yield_milli, p.produced_yield_milli, v.yield_milli,
          ri.id AS ingredient_id, ri.ingredient_name, ri.net_milli, ri.unit, ri.waste_permille,
          c.id AS catalog_ingredient_id, c.name AS catalog_name, c.base_unit
         FROM productions p
         JOIN recipe_versions v ON v.id = p.recipe_version_id
         JOIN recipes r ON r.id = v.recipe_id
         JOIN recipe_ingredients ri ON ri.version_id = v.id
         LEFT JOIN catalog_ingredients c ON c.id = ri.catalog_ingredient_id AND c.kitchen_id = p.kitchen_id AND c.archived_at IS NULL
         WHERE p.kitchen_id = ? AND p.status IN ('planned', 'in_progress')
           AND (r.owner_user_id = ? OR r.visibility = 'kitchen'
             OR EXISTS (SELECT 1 FROM recipe_access a WHERE a.recipe_id = r.id AND a.user_id = ?))`,
      ).bind(kitchenId, actor.userId, actor.userId).all<Row>(),
      context.env.DB.prepare(
        "SELECT ingredient_id, SUM(delta_milli) AS milli FROM stock_movements WHERE kitchen_id = ? GROUP BY ingredient_id",
      ).bind(kitchenId).all<{ ingredient_id: string; milli: number }>(),
      context.env.DB.prepare(
        `SELECT l.catalog_ingredient_id, SUM(l.quantity_milli - COALESCE(
            (SELECT SUM(rl.quantity_milli) FROM purchase_receipt_lines rl WHERE rl.purchase_line_id = l.id), 0)) AS milli
         FROM purchase_lines l JOIN purchase_orders o ON o.id = l.order_id
         WHERE o.kitchen_id = ? AND o.status IN ('draft', 'sent', 'confirmed') AND l.catalog_ingredient_id IS NOT NULL
         GROUP BY l.catalog_ingredient_id`,
      ).bind(kitchenId).all<{ catalog_ingredient_id: string; milli: number }>(),
    ]);
    const requirementRows: RequirementRow[] = rows.results.map((row) => {
      const scaled = scaleIngredient(
        { id: row.ingredient_id, name: row.ingredient_name, netMilli: row.net_milli, unit: row.unit, wastePermille: row.waste_permille },
        row.yield_milli, row.target_yield_milli,
      );
      const linked = row.catalog_ingredient_id && row.base_unit && compatibleStockUnit(row.unit, row.base_unit);
      return {
        productionId: row.production_id, productionTitle: row.title,
        ingredientName: linked ? row.catalog_name! : row.ingredient_name,
        catalogIngredientId: linked ? row.catalog_ingredient_id : null, unit: row.unit,
        baseUnit: linked ? row.base_unit : null, requiredGrossMilli: scaled.requiredGrossMilli,
        requiredBaseMilli: linked ? toStockMilli(scaled.requiredGrossMilli, row.unit, row.base_unit!) : null,
        targetYieldMilli: row.target_yield_milli, producedYieldMilli: row.produced_yield_milli,
      };
    });
    const summary = summarizeRequirements(
      requirementRows,
      new Map(stock.results.map((row) => [row.ingredient_id, Math.max(0, row.milli)])),
      new Map(incoming.results.map((row) => [row.catalog_ingredient_id, Math.max(0, row.milli)])),
    );
    return context.json(summary);
  });
}

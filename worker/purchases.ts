import type { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AuthBindings } from "./auth";
import { requireManager, requireMember } from "./permissions";

type App = Hono<{ Bindings: AuthBindings }>;
type OrderLineInput = { ingredientId?: string; quantityMilli?: number; note?: string };
type OrderInput = { orderId?: string; supplierId?: string; note?: string; lines?: OrderLineInput[] };
type ReceiptInput = { operationId?: string; lines?: { lineId?: string; quantityMilli?: number }[] };

function validQuantity(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

export function registerPurchaseRoutes(app: App) {
  app.get("/api/kitchens/:kitchenId/suppliers", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    const actor = await requireMember(context, kitchenId);
    requireManager(actor.role);
    const result = await context.env.DB.prepare(
      "SELECT id, name, contact FROM suppliers WHERE kitchen_id = ? ORDER BY name COLLATE NOCASE",
    ).bind(kitchenId).all();
    return context.json({ suppliers: result.results });
  });

  app.post("/api/kitchens/:kitchenId/suppliers", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    const actor = await requireMember(context, kitchenId);
    requireManager(actor.role);
    let body: { name?: string; contact?: string };
    try { body = await context.req.json(); } catch { throw new HTTPException(400, { message: "JSON inválido" }); }
    const name = body.name?.trim() ?? "";
    const contact = body.contact?.trim() ?? "";
    if (!name || name.length > 200 || contact.length > 500) throw new HTTPException(400, { message: "Proveedor inválido" });
    const id = crypto.randomUUID();
    await context.env.DB.prepare("INSERT INTO suppliers (id, kitchen_id, name, contact) VALUES (?, ?, ?, ?)")
      .bind(id, kitchenId, name, contact).run();
    return context.json({ id, name, contact }, 201);
  });

  app.get("/api/kitchens/:kitchenId/orders", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    const actor = await requireMember(context, kitchenId);
    requireManager(actor.role);
    const [orders, lines] = await Promise.all([
      context.env.DB.prepare(
        `SELECT o.id, o.supplier_id, s.name AS supplier_name, s.contact AS supplier_contact,
          o.status, o.sent_at, o.created_at, o.note
         FROM purchase_orders o JOIN suppliers s ON s.id = o.supplier_id
         WHERE o.kitchen_id = ? ORDER BY o.created_at DESC, o.id DESC LIMIT 100`,
      ).bind(kitchenId).all(),
      context.env.DB.prepare(
        `SELECT l.id, l.order_id, l.catalog_ingredient_id, l.ingredient_name, l.quantity_milli,
          l.unit, l.note, COALESCE(SUM(rl.quantity_milli), 0) AS received_milli
         FROM purchase_lines l JOIN purchase_orders o ON o.id = l.order_id
         LEFT JOIN purchase_receipt_lines rl ON rl.purchase_line_id = l.id
         WHERE o.kitchen_id = ? GROUP BY l.id`,
      ).bind(kitchenId).all(),
    ]);
    return context.json({ orders: orders.results.map((order) => ({
      ...order, lines: lines.results.filter((line) => line.order_id === order.id),
    })) });
  });

  app.post("/api/kitchens/:kitchenId/orders", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    const actor = await requireMember(context, kitchenId);
    requireManager(actor.role);
    let body: OrderInput;
    try { body = await context.req.json(); } catch { throw new HTTPException(400, { message: "JSON inválido" }); }
    const note = body.note?.trim() ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(body.orderId ?? "") || !body.supplierId || note.length > 1000 || !Array.isArray(body.lines) || !body.lines.length || body.lines.length > 100 ||
      body.lines.some((line) => !line.ingredientId || !validQuantity(line.quantityMilli) || (line.note?.length ?? 0) > 1000) ||
      new Set(body.lines.map((line) => line.ingredientId)).size !== body.lines.length) {
      throw new HTTPException(400, { message: "Pedido inválido" });
    }
    const supplier = await context.env.DB.prepare("SELECT id FROM suppliers WHERE id = ? AND kitchen_id = ?")
      .bind(body.supplierId, kitchenId).first();
    if (!supplier) throw new HTTPException(404, { message: "Proveedor no encontrado" });
    const previous = await context.env.DB.prepare("SELECT kitchen_id, supplier_id, note FROM purchase_orders WHERE id = ?")
      .bind(body.orderId).first<{ kitchen_id: string; supplier_id: string; note: string }>();
    if (previous) {
      const recorded = await context.env.DB.prepare(
        "SELECT catalog_ingredient_id, quantity_milli, note FROM purchase_lines WHERE order_id = ?",
      ).bind(body.orderId).all<{ catalog_ingredient_id: string; quantity_milli: number; note: string }>();
      if (previous.kitchen_id !== kitchenId || previous.supplier_id !== body.supplierId || previous.note !== note ||
        recorded.results.length !== body.lines.length || body.lines.some((line) => !recorded.results.some((row) =>
          row.catalog_ingredient_id === line.ingredientId && row.quantity_milli === line.quantityMilli && row.note === (line.note?.trim() ?? "")))) {
        throw new HTTPException(409, { message: "Identificador de pedido reutilizado con otros datos" });
      }
      return context.json({ id: body.orderId, repeated: true });
    }
    const ingredients = await context.env.DB.prepare(
      "SELECT id, name, base_unit FROM catalog_ingredients WHERE kitchen_id = ? AND archived_at IS NULL",
    ).bind(kitchenId).all<{ id: string; name: string; base_unit: string }>();
    const byId = new Map(ingredients.results.map((row) => [row.id, row]));
    if (body.lines.some((line) => !byId.has(line.ingredientId!))) throw new HTTPException(400, { message: "Ingrediente ajeno o inexistente" });
    const id = body.orderId;
    await context.env.DB.batch([
      context.env.DB.prepare(
        "INSERT INTO purchase_orders (id, kitchen_id, supplier_id, status, created_by_user_id, created_at, note) VALUES (?, ?, ?, 'draft', ?, ?, ?)",
      ).bind(id, kitchenId, body.supplierId, actor.userId, new Date().toISOString(), note),
      ...body.lines.map((line) => {
        const ingredient = byId.get(line.ingredientId!)!;
        return context.env.DB.prepare(
          `INSERT INTO purchase_lines (id, order_id, ingredient_name, quantity_milli, unit, note, catalog_ingredient_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(crypto.randomUUID(), id, ingredient.name, line.quantityMilli, ingredient.base_unit, line.note?.trim() ?? "", ingredient.id);
      }),
    ]);
    return context.json({ id, status: "draft" }, 201);
  });

  app.put("/api/kitchens/:kitchenId/orders/:orderId/status", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    const actor = await requireMember(context, kitchenId);
    requireManager(actor.role);
    let body: { status?: string };
    try { body = await context.req.json(); } catch { throw new HTTPException(400, { message: "JSON inválido" }); }
    const orderId = context.req.param("orderId");
    const order = await context.env.DB.prepare("SELECT status FROM purchase_orders WHERE id = ? AND kitchen_id = ?")
      .bind(orderId, kitchenId).first<{ status: string }>();
    if (!order) throw new HTTPException(404, { message: "Pedido no encontrado" });
    const allowed: Record<string, string[]> = {
      draft: ["sent", "cancelled"], sent: ["confirmed", "cancelled"], confirmed: ["cancelled"],
    };
    if (!allowed[order.status]?.includes(body.status ?? "")) throw new HTTPException(409, { message: "Transición de pedido inválida" });
    const result = await context.env.DB.prepare(
      "UPDATE purchase_orders SET status = ?, sent_at = CASE WHEN ? = 'sent' THEN ? ELSE sent_at END WHERE id = ? AND kitchen_id = ? AND status = ?",
    ).bind(body.status, body.status, new Date().toISOString(), orderId, kitchenId, order.status).run();
    if (!result.meta.changes) throw new HTTPException(409, { message: "El pedido cambió mientras se editaba" });
    return context.json({ id: orderId, status: body.status });
  });

  app.post("/api/kitchens/:kitchenId/orders/:orderId/receipts", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    const actor = await requireMember(context, kitchenId);
    requireManager(actor.role);
    let body: ReceiptInput;
    try { body = await context.req.json(); } catch { throw new HTTPException(400, { message: "JSON inválido" }); }
    const operationId = body.operationId ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(operationId) || !Array.isArray(body.lines) || !body.lines.length ||
      body.lines.some((line) => !line.lineId || !validQuantity(line.quantityMilli)) ||
      new Set(body.lines.map((line) => line.lineId)).size !== body.lines.length) {
      throw new HTTPException(400, { message: "Recepción inválida" });
    }
    const orderId = context.req.param("orderId");
    const existing = await context.env.DB.prepare("SELECT order_id FROM purchase_receipts WHERE operation_id = ?")
      .bind(operationId).first<{ order_id: string }>();
    if (existing) {
      if (existing.order_id !== orderId) throw new HTTPException(409, { message: "Identificador de recepción reutilizado" });
      const recorded = await context.env.DB.prepare(
        "SELECT purchase_line_id, quantity_milli FROM purchase_receipt_lines WHERE receipt_operation_id = ?",
      ).bind(operationId).all<{ purchase_line_id: string; quantity_milli: number }>();
      if (recorded.results.length !== body.lines.length || body.lines.some((line) =>
        !recorded.results.some((row) => row.purchase_line_id === line.lineId && row.quantity_milli === line.quantityMilli))) {
        throw new HTTPException(409, { message: "Identificador de recepción reutilizado con otras cantidades" });
      }
      return context.json({ operationId, repeated: true });
    }
    const order = await context.env.DB.prepare("SELECT status FROM purchase_orders WHERE id = ? AND kitchen_id = ?")
      .bind(orderId, kitchenId).first<{ status: string }>();
    if (!order) throw new HTTPException(404, { message: "Pedido no encontrado" });
    if (order.status !== "sent" && order.status !== "confirmed") throw new HTTPException(409, { message: "El pedido no admite recepción" });
    const lines = await context.env.DB.prepare(
      "SELECT id, catalog_ingredient_id, quantity_milli FROM purchase_lines WHERE order_id = ?",
    ).bind(orderId).all<{ id: string; catalog_ingredient_id: string | null; quantity_milli: number }>();
    const byId = new Map(lines.results.map((row) => [row.id, row]));
    if (body.lines.some((line) => !byId.get(line.lineId!)?.catalog_ingredient_id)) {
      throw new HTTPException(400, { message: "La línea no está vinculada al inventario" });
    }
    const statements: D1PreparedStatement[] = [context.env.DB.prepare(
      "INSERT INTO purchase_receipts (operation_id, order_id, received_by_user_id) VALUES (?, ?, ?)",
    ).bind(operationId, orderId, actor.userId)];
    for (const line of body.lines) {
      const ingredient = byId.get(line.lineId!)!;
      statements.push(context.env.DB.prepare(
        "INSERT INTO purchase_receipt_lines (id, receipt_operation_id, purchase_line_id, quantity_milli) VALUES (?, ?, ?, ?)",
      ).bind(crypto.randomUUID(), operationId, line.lineId, line.quantityMilli));
      statements.push(context.env.DB.prepare(
        `INSERT INTO stock_movements
         (operation_id, kitchen_id, ingredient_id, delta_milli, kind, note, actor_user_id, recorded_at)
         VALUES (?, ?, ?, ?, 'received', ?, ?, ?)`,
      ).bind(`${operationId}:${line.lineId}`, kitchenId, ingredient.catalog_ingredient_id,
        line.quantityMilli, `Recepción de pedido ${orderId}`, actor.userId, new Date().toISOString()));
    }
    statements.push(context.env.DB.prepare(
      `UPDATE purchase_orders SET status = 'received' WHERE id = ? AND NOT EXISTS (
        SELECT 1 FROM purchase_lines l WHERE l.order_id = ? AND
          COALESCE((SELECT SUM(rl.quantity_milli) FROM purchase_receipt_lines rl WHERE rl.purchase_line_id = l.id), 0) < l.quantity_milli
      )`,
    ).bind(orderId, orderId));
    try { await context.env.DB.batch(statements); }
    catch { throw new HTTPException(409, { message: "Recepción duplicada, excedida o inválida" }); }
    return context.json({ operationId, repeated: false }, 201);
  });
}

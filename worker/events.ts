import type { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AuthBindings } from "./auth";
import { requireManager, requireMember } from "./permissions";

type App = Hono<{ Bindings: AuthBindings }>;
type EventInput = { name?: string; eventDate?: string; guestCount?: number | null; notes?: string };

function validate(raw: EventInput) {
  const name = raw.name?.trim() ?? "";
  const eventDate = raw.eventDate ?? "";
  const guestCount = raw.guestCount ?? null;
  const notes = raw.notes?.trim() ?? "";
  if (!name || name.length > 200 || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) ||
    !Number.isFinite(Date.parse(eventDate + "T12:00:00Z")) ||
    (guestCount !== null && (!Number.isSafeInteger(guestCount) || guestCount < 0)) || notes.length > 5000) {
    throw new HTTPException(400, { message: "Datos de evento inválidos" });
  }
  return { name, eventDate, guestCount, notes };
}

export function registerEventRoutes(app: App) {
  app.get("/api/kitchens/:kitchenId/events", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    await requireMember(context, kitchenId);
    const result = await context.env.DB.prepare(
      "SELECT id, name, event_date, guest_count, notes FROM events WHERE kitchen_id = ? ORDER BY event_date DESC",
    ).bind(kitchenId).all();
    return context.json({ events: result.results });
  });

  app.post("/api/kitchens/:kitchenId/events", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    const actor = await requireMember(context, kitchenId);
    requireManager(actor.role);
    let body: EventInput;
    try { body = await context.req.json(); } catch { throw new HTTPException(400, { message: "JSON inválido" }); }
    const data = validate(body);
    const id = crypto.randomUUID();
    await context.env.DB.prepare(
      "INSERT INTO events (id, kitchen_id, name, event_date, guest_count, notes) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(id, kitchenId, data.name, data.eventDate, data.guestCount, data.notes).run();
    return context.json({ id }, 201);
  });

  app.put("/api/kitchens/:kitchenId/events/:eventId", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    const actor = await requireMember(context, kitchenId);
    requireManager(actor.role);
    let body: EventInput;
    try { body = await context.req.json(); } catch { throw new HTTPException(400, { message: "JSON inválido" }); }
    const data = validate(body);
    const result = await context.env.DB.prepare(
      "UPDATE events SET name = ?, event_date = ?, guest_count = ?, notes = ? WHERE id = ? AND kitchen_id = ?",
    ).bind(data.name, data.eventDate, data.guestCount, data.notes, context.req.param("eventId"), kitchenId).run();
    if (!result.meta.changes) throw new HTTPException(404, { message: "Evento no encontrado" });
    return context.json({ id: context.req.param("eventId") });
  });
}

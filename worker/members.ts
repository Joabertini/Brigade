import type { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createAuth, type AuthBindings } from "./auth";
import { requireMember, type KitchenRole } from "./permissions";

type App = Hono<{ Bindings: AuthBindings }>;

async function tokenHash(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

type Invitation = {
  id: string; kitchen_id: string; email: string; role: KitchenRole;
  expires_at: string; accepted_at: string | null;
};

async function findInvitation(db: D1Database, token: string): Promise<Invitation | null> {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return null;
  const invitation = await db.prepare(
    "SELECT id, kitchen_id, email, role, expires_at, accepted_at FROM invitations WHERE token_hash = ?",
  ).bind(await tokenHash(token)).first<Invitation>();
  if (!invitation || invitation.accepted_at || invitation.expires_at < new Date().toISOString()) return null;
  return invitation;
}

export function registerMemberRoutes(app: App) {
  app.get("/api/invitations/:token", async (context) => {
    const invitation = await findInvitation(context.env.DB, context.req.param("token"));
    if (!invitation) throw new HTTPException(404, { message: "Invitación no disponible" });
    const kitchen = await context.env.DB.prepare("SELECT name FROM kitchens WHERE id = ?")
      .bind(invitation.kitchen_id).first<{ name: string }>();
    return context.json({ email: invitation.email, role: invitation.role, kitchenName: kitchen?.name, expiresAt: invitation.expires_at });
  });

  app.get("/api/kitchens/:kitchenId/members", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    const actor = await requireMember(context, kitchenId);
    const result = await context.env.DB.prepare(
      `SELECT m.user_id AS id, u.name, u.email, m.role, m.status
       FROM memberships m JOIN "user" u ON u.id = m.user_id
       WHERE m.kitchen_id = ? ORDER BY u.name`,
    ).bind(kitchenId).all();
    return context.json({
      members: result.results.map((row) => actor.role === "commis" ? {
        id: row.id, name: row.name, role: row.role, status: row.status,
      } : row),
    });
  });

  app.post("/api/kitchens/:kitchenId/invitations", async (context) => {
    const kitchenId = context.req.param("kitchenId");
    const actor = await requireMember(context, kitchenId);
    if (actor.role !== "chef") throw new HTTPException(403, { message: "Solo el chef puede invitar" });
    let body: { email?: string; role?: KitchenRole };
    try { body = await context.req.json(); } catch { throw new HTTPException(400, { message: "JSON inválido" }); }
    const email = body.email?.trim().toLowerCase() ?? "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !body.role || !["chef", "sous_chef", "commis"].includes(body.role)) {
      throw new HTTPException(400, { message: "Email o rol inválido" });
    }
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(tokenBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await context.env.DB.prepare(
      "INSERT INTO invitations (id, kitchen_id, email, role, token_hash, invited_by_user_id, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, kitchenId, email, body.role, await tokenHash(token), actor.userId, expiresAt).run();
    return context.json({ invitationId: id, email, role: body.role, token, expiresAt }, 201);
  });

  app.post("/api/invitations/accept", async (context) => {
    let body: { token?: string; name?: string; password?: string };
    try { body = await context.req.json(); } catch { throw new HTTPException(400, { message: "JSON inválido" }); }
    const invitation = await findInvitation(context.env.DB, body.token ?? "");
    if (!invitation) throw new HTTPException(404, { message: "Invitación no disponible" });
    const name = body.name?.trim() ?? "";
    const password = body.password ?? "";
    if (!name || password.length < 12) throw new HTTPException(400, { message: "Nombre y contraseña de 12 caracteres requeridos" });
    const existing = await context.env.DB.prepare('SELECT 1 FROM "user" WHERE email = ?').bind(invitation.email).first();
    if (existing) throw new HTTPException(409, { message: "Ya existe una cuenta; ingresá antes de aceptar" });
    const auth = createAuth(context.env, context.req.raw, true);
    const result = await auth.api.signUpEmail({ body: { name, email: invitation.email, password } });
    if (!result?.user) throw new HTTPException(500, { message: "No se pudo crear la cuenta" });
    await context.env.DB.batch([
      context.env.DB.prepare(
        "INSERT INTO memberships (kitchen_id, user_id, role, status) VALUES (?, ?, ?, 'active')",
      ).bind(invitation.kitchen_id, result.user.id, invitation.role),
      context.env.DB.prepare(
        "UPDATE invitations SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL",
      ).bind(new Date().toISOString(), invitation.id),
    ]);
    return context.json({ kitchenId: invitation.kitchen_id, role: invitation.role }, 201);
  });

  app.post("/api/invitations/accept-existing", async (context) => {
    const auth = createAuth(context.env, context.req.raw);
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) throw new HTTPException(401, { message: "Sesión requerida" });
    let body: { token?: string };
    try { body = await context.req.json(); } catch { throw new HTTPException(400, { message: "JSON inválido" }); }
    const invitation = await findInvitation(context.env.DB, body.token ?? "");
    if (!invitation || invitation.email !== session.user.email.toLowerCase()) {
      throw new HTTPException(404, { message: "Invitación no disponible" });
    }
    await context.env.DB.batch([
      context.env.DB.prepare(
        "INSERT OR IGNORE INTO memberships (kitchen_id, user_id, role, status) VALUES (?, ?, ?, 'active')",
      ).bind(invitation.kitchen_id, session.user.id, invitation.role),
      context.env.DB.prepare(
        "UPDATE invitations SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL",
      ).bind(new Date().toISOString(), invitation.id),
    ]);
    return context.json({ kitchenId: invitation.kitchen_id, role: invitation.role });
  });
}

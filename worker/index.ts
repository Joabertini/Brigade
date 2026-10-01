import { Hono } from "hono";
import { createAuth, type AuthBindings } from "./auth";
import { registerRecipeRoutes } from "./recipes";
import { registerProductionRoutes } from "./production";
import { registerMemberRoutes } from "./members";
import { registerEventRoutes } from "./events";
import { registerInventoryRoutes } from "./inventory";
import { registerPurchaseRoutes } from "./purchases";
import { registerRequirementRoutes } from "./requirements";
import { registerCaptureRoutes } from "./capture";
import { registerTranscribeRoutes } from "./transcribe";

const app = new Hono<{ Bindings: AuthBindings }>();

function sameToken(actual: string, expected: string): boolean {
  if (!actual || !expected || actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}

app.all("/api/auth/*", (context) => createAuth(context.env, context.req.raw).handler(context.req.raw));

app.post("/api/setup/first-chef", async (context) => {
  if (!context.env.BOOTSTRAP_TOKEN) return context.json({ error: "Configuración inicial no disponible" }, 404);
  if (!sameToken(context.req.header("X-Brigade-Setup") ?? "", context.env.BOOTSTRAP_TOKEN)) {
    return context.json({ error: "No autorizado" }, 401);
  }
  const existing = await context.env.DB.prepare("SELECT COUNT(*) AS count FROM kitchens").first<{ count: number }>();
  const users = await context.env.DB.prepare('SELECT COUNT(*) AS count FROM "user"').first<{ count: number }>();
  if ((existing?.count ?? 0) > 0 || (users?.count ?? 0) > 0) return context.json({ error: "La cocina ya está configurada" }, 409);

  let body: { name?: string; email?: string; password?: string; kitchenName?: string };
  try { body = await context.req.json(); } catch { return context.json({ error: "JSON inválido" }, 400); }
  const name = body.name?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const kitchenName = body.kitchenName?.trim() ?? "";
  if (!name || !email.includes("@") || password.length < 12 || !kitchenName) {
    return context.json({ error: "Nombre, email, contraseña de 12 caracteres y cocina son obligatorios" }, 400);
  }

  const auth = createAuth(context.env, context.req.raw, true);
  const result = await auth.api.signUpEmail({ body: { name, email, password } });
  if (!result?.user) return context.json({ error: "No se pudo crear el chef" }, 500);
  const kitchenId = crypto.randomUUID();
  await context.env.DB.batch([
    context.env.DB.prepare("INSERT INTO kitchens (id, name) VALUES (?, ?)").bind(kitchenId, kitchenName),
    context.env.DB.prepare("INSERT INTO memberships (kitchen_id, user_id, role, status) VALUES (?, ?, 'chef', 'active')").bind(kitchenId, result.user.id),
  ]);
  return context.json({ kitchenId, userId: result.user.id }, 201);
});

app.get("/api/me", async (context) => {
  const auth = createAuth(context.env, context.req.raw);
  const session = await auth.api.getSession({ headers: context.req.raw.headers });
  if (!session) return context.json({ error: "Sesión requerida" }, 401);
  const memberships = await context.env.DB.prepare(
    "SELECT kitchen_id, role, status FROM memberships WHERE user_id = ? AND status = 'active'",
  ).bind(session.user.id).all();
  return context.json({ user: { id: session.user.id, name: session.user.name, email: session.user.email }, memberships: memberships.results });
});

registerRecipeRoutes(app);
registerProductionRoutes(app);
registerMemberRoutes(app);
registerEventRoutes(app);
registerInventoryRoutes(app);
registerPurchaseRoutes(app);
registerRequirementRoutes(app);
registerCaptureRoutes(app);
registerTranscribeRoutes(app);

app.get("/api/health", async (context) => {
  const result = await context.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
  return context.json({ status: result?.ok === 1 ? "ok" : "error" }, result?.ok === 1 ? 200 : 503);
});

// Domain endpoints are mounted only after session and membership checks are in place.
app.all("/api/*", (context) => context.json({ error: "Ruta no disponible" }, 404));

export default app;

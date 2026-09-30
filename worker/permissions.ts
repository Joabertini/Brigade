import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { createAuth, type AuthBindings } from "./auth";

export type KitchenRole = "chef" | "sous_chef" | "commis";
export type KitchenContext = Context<{ Bindings: AuthBindings }>;

export async function requireMember(context: KitchenContext, kitchenId: string): Promise<{ userId: string; role: KitchenRole }> {
  const auth = createAuth(context.env, context.req.raw);
  const session = await auth.api.getSession({ headers: context.req.raw.headers });
  if (!session) throw new HTTPException(401, { message: "Sesión requerida" });
  const membership = await context.env.DB.prepare(
    "SELECT role FROM memberships WHERE kitchen_id = ? AND user_id = ? AND status = 'active'",
  ).bind(kitchenId, session.user.id).first<{ role: KitchenRole }>();
  if (!membership) throw new HTTPException(403, { message: "Sin acceso a esta cocina" });
  return { userId: session.user.id, role: membership.role };
}

export function requireManager(role: KitchenRole): void {
  if (role !== "chef" && role !== "sous_chef") throw new HTTPException(403, { message: "Permiso insuficiente" });
}

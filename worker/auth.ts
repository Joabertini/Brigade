import { betterAuth } from "better-auth";

export type AuthBindings = {
  DB: D1Database;
  BETTER_AUTH_SECRET?: string;
  BOOTSTRAP_TOKEN?: string;
  PUBLIC_ORIGIN?: string;
  AI?: Ai;
};

export function createAuth(env: AuthBindings, request: Request, allowSignUp = false) {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error("BETTER_AUTH_SECRET no está configurado");
  }
  // PUBLIC_ORIGIN lists the frontends allowed to proxy /api here (comma separated, first is canonical).
  // Behind the Vercel rewrite the request URL is the Worker's, so the browser origin decides the base URL.
  const allowed = (env.PUBLIC_ORIGIN ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const origin = request.headers.get("origin");
  const exact = allowed.filter((value) => !value.includes("*"));
  const baseURL = origin && exact.includes(origin) ? origin : exact[0] || new URL(request.url).origin;
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL,
    trustedOrigins: allowed.length ? allowed : [baseURL],
    emailAndPassword: { enabled: true, disableSignUp: !allowSignUp },
  });
}

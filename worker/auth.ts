import { betterAuth } from "better-auth";

export type AuthBindings = {
  DB: D1Database;
  BETTER_AUTH_SECRET?: string;
  BOOTSTRAP_TOKEN?: string;
  PUBLIC_ORIGIN?: string;
};

export function createAuth(env: AuthBindings, request: Request, allowSignUp = false) {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error("BETTER_AUTH_SECRET no está configurado");
  }
  const baseURL = env.PUBLIC_ORIGIN || new URL(request.url).origin;
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL,
    trustedOrigins: [baseURL],
    emailAndPassword: { enabled: true, disableSignUp: !allowSignUp },
  });
}

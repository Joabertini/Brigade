import { betterAuth } from "better-auth";
import { DatabaseSync } from "node:sqlite";

// CLI-only schema definition. Keep authentication options in sync with worker/auth.ts.
export const auth = betterAuth({
  database: new DatabaseSync(":memory:"),
  baseURL: "http://localhost:5173",
  emailAndPassword: { enabled: true, disableSignUp: true },
});

import { useState } from "react";
import type { Identity } from "../../data/repository";

export function LoginView({ onLogin, onLocal }: { onLogin: (identity: Identity) => void; onLocal: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      if (!response.ok) throw new Error("No pudimos iniciar sesión. Revisá email y contraseña.");
      const profile = await fetch("/api/me", { credentials: "same-origin" });
      if (!profile.ok) throw new Error("La sesión no pudo verificarse.");
      const data = await profile.json() as {
        user: Identity["user"];
        memberships: { kitchen_id: string; role: Identity["role"] }[];
      };
      const kitchen = data.memberships[0];
      if (!kitchen) throw new Error("Tu cuenta todavía no pertenece a una cocina.");
      onLogin({ user: data.user, kitchenId: kitchen.kitchen_id, role: kitchen.role });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo entrar");
    } finally {
      setLoading(false);
    }
  }

  return <div className="login-shell">
    <div className="brand">brigade<span>.</span></div>
    <div className="login-card">
      <p className="eyebrow">TU COCINA, EN ORDEN</p>
      <h1>Bienvenido<br />a cocina.</h1>
      <p className="muted">Ingresá con la cuenta que recibió una invitación de tu chef.</p>
      <form onSubmit={signIn}>
        <label className="field">Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label className="field">Contraseña<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" type="submit" disabled={loading}>{loading ? "Entrando…" : "Entrar a Brigade"}</button>
      </form>
      <button className="text-button" onClick={onLocal}>Abrir cuaderno local de este dispositivo</button>
    </div>
  </div>;
}

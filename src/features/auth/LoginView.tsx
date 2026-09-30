import { useState } from "react";
import { Button, ErrorNote, PageHead } from "../../components/ui";
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

  return <div className="b2-frame">
    <header className="b2-header"><div className="b2-brand">brigade<em>.</em></div></header>
    <div className="b2-scroll"><main className="b2-login">
      <PageHead eyebrow="TU COCINA, EN ORDEN" title={<>Bienvenido<br />a cocina.</>} sub="Ingresá con la cuenta que recibió una invitación de tu chef." />
      <form onSubmit={signIn}>
        <label className="b2-field">Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label className="b2-field">Contraseña<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        <ErrorNote>{error}</ErrorNote>
        <Button full type="submit" disabled={loading}>{loading ? "Entrando…" : "Entrar a Brigade"}</Button>
      </form>
      <div className="b2-actions"><button type="button" className="b2-link" onClick={onLocal}>Abrir cuaderno local de este dispositivo</button></div>
    </main></div>
  </div>;
}

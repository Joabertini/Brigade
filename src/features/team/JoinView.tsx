import { useEffect, useState } from "react";
import type { Identity } from "../../data/repository";

type Invite = { email: string; role: Identity["role"]; kitchenName: string; expiresAt: string };

export function JoinView({ token, onJoined }: { token: string; onJoined: (identity: Identity) => void }) {
  const [invite, setInvite] = useState<Invite | null>(null);
  const [existing, setExisting] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/invitations/" + encodeURIComponent(token))
      .then(async (response) => {
        if (!response.ok) throw new Error("La invitación venció o ya fue usada.");
        return response.json() as Promise<Invite>;
      })
      .then(setInvite)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "No se pudo abrir la invitación"));
  }, [token]);

  async function join(event: React.FormEvent) {
    event.preventDefault();
    if (!invite) return;
    setBusy(true); setError("");
    try {
      let acceptedKitchenId = "";
      if (!existing) {
        const response = await fetch("/api/invitations/accept", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, name, password }),
        });
        if (!response.ok) throw new Error("No se pudo aceptar la invitación. Revisá tus datos.");
        acceptedKitchenId = (await response.json() as { kitchenId: string }).kitchenId;
      }
      const signIn = await fetch("/api/auth/sign-in/email", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: invite.email, password }),
      });
      if (!signIn.ok) throw new Error("La contraseña no corresponde a este email.");
      if (existing) {
        const accepted = await fetch("/api/invitations/accept-existing", {
          method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!accepted.ok) throw new Error("No se pudo asociar tu cuenta a esta cocina.");
        acceptedKitchenId = (await accepted.json() as { kitchenId: string }).kitchenId;
      }
      const profile = await fetch("/api/me", { credentials: "same-origin" });
      if (!profile.ok) throw new Error("No se pudo verificar tu equipo.");
      const data = await profile.json() as { user: Identity["user"]; memberships: { kitchen_id: string; role: Identity["role"] }[] };
      const kitchen = data.memberships.find((membership) => membership.kitchen_id === acceptedKitchenId);
      if (!kitchen) throw new Error("Tu cuenta no aparece en esta cocina.");
      history.replaceState({}, "", "/");
      onJoined({ user: data.user, kitchenId: kitchen.kitchen_id, role: kitchen.role });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo entrar"); }
    finally { setBusy(false); }
  }

  return <div className="login-shell">
    <div className="brand">brigade<span>.</span></div>
    <div className="login-card">
      <p className="eyebrow">INVITACIÓN AL EQUIPO</p>
      <h1>Sumate a<br />la brigada.</h1>
      {invite && <>
        <p className="muted">Cocina: <strong>{invite.kitchenName}</strong><br />Email: {invite.email}<br />Rol: {invite.role}</p>
        <form onSubmit={join}>
          {!existing && <label className="field">Tu nombre<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required /></label>}
          <label className="field">{existing ? "Tu contraseña" : "Crear contraseña"}<input type="password" minLength={existing ? undefined : 12} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={existing ? "current-password" : "new-password"} required /></label>
          <button className="primary" type="submit" disabled={busy}>{busy ? "Ingresando…" : existing ? "Entrar y aceptar" : "Crear cuenta y aceptar"}</button>
        </form>
        <button className="text-button" onClick={() => { setExisting(!existing); setError(""); }}>{existing ? "Crear una cuenta nueva" : "Ya tengo cuenta"}</button>
      </>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  </div>;
}

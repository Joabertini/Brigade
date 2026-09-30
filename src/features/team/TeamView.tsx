import { useEffect, useState } from "react";
import type { Identity } from "../../data/repository";

type Member = { id: string; name: string; email?: string; role: string };

export function TeamView({ identity, onMembers, onInvite }: {
  identity: Identity | null;
  onMembers: () => Promise<Member[]>;
  onInvite: (email: string, role: Identity["role"]) => Promise<{ token: string; expiresAt: string }>;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Identity["role"]>("commis");
  const [link, setLink] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!identity) return;
    onMembers().then(setMembers).catch(() => setError("No se pudo cargar el equipo."));
  }, [identity?.user.id, identity?.kitchenId]);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const invitation = await onInvite(email, role);
      setLink(window.location.origin + "/?invite=" + encodeURIComponent(invitation.token));
      setExpiresAt(invitation.expiresAt);
      setEmail("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo crear la invitación"); }
  }

  if (!identity) return <section><p className="eyebrow">EQUIPO</p><h1>Tu brigada.</h1><div className="empty"><p>Conectá tu cocina para invitar integrantes y compartir recetas.</p></div></section>;

  return <section>
    <p className="eyebrow">EQUIPO · {identity.role.toUpperCase()}</p>
    <h1>Tu brigada.</h1>
    <div className="two-column">
      <div>
        <h2>Integrantes</h2>
        {members.map((member) => <div className="line-item" key={member.id}><span>{member.name}{member.email && <><br /><small>{member.email}</small></>}</span><strong>{member.role}</strong></div>)}
      </div>
      {identity.role === "chef" && <div className="panel">
        <h2>Invitar a la cocina</h2>
        <p className="muted">La invitación dura siete días. Copiá el enlace y compartilo por el canal que prefieras.</p>
        <form onSubmit={invite}>
          <label className="field">Email de la persona<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label className="field">Rol<select value={role} onChange={(event) => setRole(event.target.value as Identity["role"])}>
            <option value="commis">Commis</option><option value="sous_chef">Sous chef</option><option value="chef">Chef</option>
          </select></label>
          <button className="primary" type="submit">Crear invitación</button>
        </form>
        {link && <div className="preview">
          <label className="field">Enlace de invitación<input value={link} readOnly onFocus={(event) => event.target.select()} /></label>
          <button className="secondary" onClick={() => void navigator.clipboard.writeText(link)}>Copiar enlace</button>
          <p className="footnote">Vence: {new Date(expiresAt).toLocaleString("es-UY")}. Se muestra una sola vez; creá otro si se pierde.</p>
        </div>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>}
    </div>
  </section>;
}

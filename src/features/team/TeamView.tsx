import { useEffect, useState } from "react";
import type { Identity } from "../../data/repository";
import { Button, ErrorNote, PageHead, initials } from "../../components/ui";

type Member = { id: string; name: string; email?: string; role: string };
const roleText: Record<string, string> = { chef: "Chef", sous_chef: "Sous chef", commis: "Commis" };

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

  if (!identity) return <section>
    <PageHead eyebrow="EQUIPO" title="Tu equipo." />
    <div className="b2-empty"><h2>Cuaderno local</h2><p className="b2-sub">Conectá tu cocina para invitar integrantes y compartir recetas.</p></div>
  </section>;

  return <section>
    <PageHead eyebrow="EQUIPO" title="Tu equipo." sub={`${members.length} ${members.length === 1 ? "integrante" : "integrantes"} · ${roleText[identity.role]}`} />
    <div className="b2-two">
      <section>
        {members.map((member) => <div className="b2-service" key={member.id} style={{ margin: 0, borderTop: 0 }}>
          <div><h2>{member.name}</h2><p className="b2-muted">{roleText[member.role] ?? member.role}{member.email ? ` · ${member.email}` : ""}</p></div>
          <span className="b2-avatar">{initials(member.name)}</span>
        </div>)}
      </section>
      {identity.role === "chef" && <section className="b2-panel" style={{ marginTop: 0 }}>
        <h2>Invitar a la cocina</h2>
        <p className="b2-sub">La invitación dura siete días. Copiá el enlace y compartilo por el canal que prefieras.</p>
        <form onSubmit={invite}>
          <label className="b2-field">Email de la persona<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label className="b2-field">Rol<select value={role} onChange={(event) => setRole(event.target.value as Identity["role"])}>
            <option value="commis">Commis</option><option value="sous_chef">Sous chef</option><option value="chef">Chef</option>
          </select></label>
          <Button full type="submit">Crear invitación</Button>
        </form>
        {link && <>
          <label className="b2-field">Enlace de invitación<input value={link} readOnly onFocus={(event) => event.target.select()} /></label>
          <Button full quiet onClick={() => void navigator.clipboard.writeText(link)}>Copiar enlace</Button>
          <p className="b2-footnote">Vence: {new Date(expiresAt).toLocaleString("es-UY")}. Se muestra una sola vez; creá otro si se pierde.</p>
        </>}
        <ErrorNote>{error}</ErrorNote>
      </section>}
    </div>
  </section>;
}

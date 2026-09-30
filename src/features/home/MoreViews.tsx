import { Boxes, CalendarDays, CloudCheck, NotebookPen, Users } from "lucide-react";
import { Button, PageHead, Tag } from "../../components/ui";
import type { Section } from "../../components/BottomNav";

export function MoreView({ commis, onNavigate, onNewRecipe }: { commis: boolean; onNavigate: (section: Section) => void; onNewRecipe: () => void }) {
  const items: [Section | "manual", string, typeof Boxes][] = [
    ["stock", "Stock", Boxes], ["team", "Equipo", Users], ["events", "Eventos", CalendarDays],
    ["sync", "Conexión", CloudCheck], ["manual", "Nueva receta", NotebookPen],
  ];
  return <section>
    <PageHead eyebrow="TU COCINA" title="Toda tu cocina." sub="Elegí dónde querés trabajar." />
    <div className="b2-menu-grid">
      {items.filter(([id]) => !commis || !["stock", "events"].includes(id)).map(([id, label, Icon]) =>
        <button type="button" key={id} onClick={() => id === "manual" ? onNewRecipe() : onNavigate(id)}><Icon />{label}</button>)}
    </div>
  </section>;
}

export function SyncView({ online, cloudMode, pending, conflicts, recipes, lastSync, onSync, onSignOut, onConnect }: {
  online: boolean; cloudMode: boolean; pending: number; conflicts: number; recipes: number; lastSync: Date | null;
  onSync: () => void; onSignOut: () => void; onConnect: () => void;
}) {
  return <section>
    <PageHead eyebrow="GUARDADO Y CONEXIÓN" title={<>Tu trabajo,<br />a salvo.</>} />
    <div className="b2-panel">
      <div className="b2-row"><Tag kind={online ? "" : "warn"}>{online ? "Conectado" : "Sin conexión"}</Tag><span className="b2-muted">Última: {lastSync ? lastSync.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—"}</span></div>
      <div className="b2-facts"><div><b>{pending}</b><span>Cambios pendientes</span></div><div><b>{conflicts}</b><span>Con conflicto</span></div><div><b>{recipes}</b><span>Recetas disponibles</span></div></div>
      <p className="b2-sub">{cloudMode
        ? "Los registros guardados aquí se sincronizan al recuperar conexión. Los pedidos requieren envío explícito."
        : "Cuaderno local: lo que guardás queda en este dispositivo, sin respaldo ni acceso del equipo."}</p>
    </div>
    <Button full onClick={onSync}>Reintentar sincronización</Button>
    <div className="b2-actions">{cloudMode
      ? <Button full quiet onClick={onSignOut}>Cerrar sesión</Button>
      : <Button full quiet onClick={onConnect}>Conectar mi cocina</Button>}</div>
  </section>;
}

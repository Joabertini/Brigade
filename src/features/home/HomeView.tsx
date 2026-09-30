import { ArrowUpRight, PackageSearch, Plus, ScanLine } from "lucide-react";
import { formatMilli } from "../../../shared/kitchen";
import type { Requirements } from "../../data/repository";
import type { LocalProduction } from "../../local-db";
import { Button, PageHead, Tag } from "../../components/ui";
import type { Section } from "../../components/BottomNav";

const weekday = new Intl.DateTimeFormat("es-UY", { weekday: "long", day: "numeric" });
const shortDate = new Intl.DateTimeFormat("es-UY", { weekday: "short", day: "2-digit" });

export function greeting(date = new Date()) {
  const hour = date.getHours();
  return hour < 13 ? "Buen día" : hour < 20 ? "Buenas tardes" : "Buenas noches";
}

export function plannedLabel(plannedFor: string) {
  if (!plannedFor) return "Sin fecha";
  const today = new Date().toISOString().slice(0, 10);
  if (plannedFor === today) return "Hoy";
  return shortDate.format(new Date(plannedFor + "T12:00:00"));
}

export function isOpen(production: LocalProduction) {
  return production.producedYieldMilli < production.targetYieldMilli;
}

export function HomeView({ name, commis, productions, requirements, lastSync, onNavigate, onOpenProduction, onCapture }: {
  name?: string;
  commis: boolean;
  productions: LocalProduction[];
  requirements: Requirements;
  lastSync: Date | null;
  onNavigate: (section: Section) => void;
  onOpenProduction: (id: string) => void;
  onCapture: () => void;
}) {
  const open = productions.filter(isOpen).sort((a, b) => (a.plannedFor || "9999").localeCompare(b.plannedFor || "9999"));
  const current = open.find((entry) => entry.producedYieldMilli > 0) ?? open[0];
  const next = open.find((entry) => entry.id !== current?.id);
  const missing = requirements.needs.filter((need) => need.shortageMilli > 0).length;
  const unlinked = new Set(requirements.unlinked.map((item) => item.ingredientName)).size;
  const first = name?.split(" ")[0] ?? "";
  const today = weekday.format(new Date()).toUpperCase();
  const title = <>{greeting()}, <br />{first ? `${first}.` : "cocina."}</>;
  const service = <div className="b2-service">
    <div><div className="b2-muted">Producción abierta</div><div style={{ fontSize: 14, marginTop: 3 }}>{open.length === 1 ? "1 preparación en cocina" : `${open.length} preparaciones en cocina`}</div></div>
    <div style={{ textAlign: "right" }}><div className="b2-eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>PRÓXIMA</div><div className="b2-time">{current ? plannedLabel(current.plannedFor) : "—"}</div></div>
  </div>;

  const focus = current ? <article className="b2-focus">
    <div className="b2-row"><Tag>{current.producedYieldMilli > 0 ? "En marcha" : "Planificada"}</Tag><span className="b2-muted">{plannedLabel(current.plannedFor)} · Versión {current.recipe.version}</span></div>
    <h2 className="b2-dish">{current.recipe.title}</h2>
    <div className="b2-numbers"><div className="b2-big">{formatMilli(current.producedYieldMilli, current.recipe.yieldUnit).split(" ")[0]}<span>/ {formatMilli(current.targetYieldMilli, current.recipe.yieldUnit)}</span></div><div className="b2-muted">listas</div></div>
    <div className="b2-track"><span style={{ width: `${Math.min(100, current.producedYieldMilli / current.targetYieldMilli * 100)}%` }} /></div>
    <Button full onClick={() => onOpenProduction(current.id)}>Continuar producción <ArrowUpRight /></Button>
  </article> : <article className="b2-focus">
    <div className="b2-row"><Tag kind="neutral">Sin producción abierta</Tag></div>
    <h2 className="b2-dish">{commis ? "Nada asignado todavía" : "Tu próxima preparación"}</h2>
    <p className="b2-sub">{commis ? "Cuando la jefatura planifique una producción compartida, aparece acá." : "Elegí una receta del recetario y planificá cuánto producir."}</p>
    <div className="b2-actions"><Button full onClick={() => onNavigate("recipes")}>Abrir recetario <ArrowUpRight /></Button></div>
  </article>;

  if (commis) return <section>
    <PageHead eyebrow={`TU JORNADA · ${today}`} title={title} sub={current ? `${current.recipe.title} necesita tu atención.` : undefined} />
    {service}
    {focus}
    {lastSync && <p className="b2-footnote">Última sincronización · {lastSync.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hour12: false })}</p>}
  </section>;

  return <section>
    <PageHead eyebrow={`TU COCINA · ${today}`} title={title} />
    <div className="b2-homegrid">
      <div>
        {service}
        <div className="b2-overline"><h2>Continuar donde estabas</h2></div>
        {focus}
      </div>
      <div>
        <button type="button" className="b2-attention" onClick={() => onNavigate("orders")}>
          <span className="b2-attention-icon"><PackageSearch /></span>
          <span>{missing ? `${missing} ${missing === 1 ? "faltante" : "faltantes"} para resolver` : "Sin faltantes para producir"}<small>{unlinked ? `${unlinked} sin vincular a stock · ` : ""}Revisar cantidades y proveedores</small></span>
          <ArrowUpRight />
        </button>
        {next && <div className="b2-next">
          <div className="b2-eyebrow">DESPUÉS, EN COCINA</div>
          <div className="b2-nextrow">
            <div><h3 className="b2-dish">{next.recipe.title}</h3><span className="b2-muted">{formatMilli(next.targetYieldMilli, next.recipe.yieldUnit)} · {plannedLabel(next.plannedFor)}</span></div>
            <button type="button" className="b2-square" onClick={() => onOpenProduction(next.id)} aria-label={`Abrir ${next.recipe.title}`}><ArrowUpRight /></button>
          </div>
        </div>}
        <button type="button" className="b2-attention" onClick={onCapture}>
          <span className="b2-attention-icon" style={{ background: "#273120", color: "var(--b-accent)" }}><ScanLine /></span>
          <span>Tu receta, desde un texto<small>Mensajes, notas o cuadernos</small></span>
          <Plus />
        </button>
        {lastSync && <p className="b2-footnote">Última sincronización · {lastSync.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hour12: false })}</p>}
      </div>
    </div>
  </section>;
}

import { BookOpen, Boxes, CalendarDays, CookingPot, Grid2x2, ShoppingBasket, Sun, Users, type LucideIcon } from "lucide-react";

export type Section = "today" | "recipes" | "production" | "orders" | "stock" | "team" | "events" | "more" | "sync";

const links: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: "today", label: "Hoy", icon: Sun },
  { id: "recipes", label: "Recetas", icon: BookOpen },
  { id: "production", label: "Cocina", icon: CookingPot },
  { id: "orders", label: "Pedidos", icon: ShoppingBasket },
  { id: "stock", label: "Stock", icon: Boxes },
  { id: "team", label: "Equipo", icon: Users },
  { id: "events", label: "Eventos", icon: CalendarDays },
];

/** Commis do not see purchasing, stock or events, as in the approved role view. */
export function BottomNav({ section, commis, onNavigate }: { section: Section; commis: boolean; onNavigate: (section: Section) => void }) {
  const visible = links.filter((link) => !commis || !["orders", "stock", "events"].includes(link.id));
  const active = section === "sync" || (["stock", "events"].includes(section)) || (section === "team" && !commis) ? "more" : section;
  return <div className="b2-dock-area">
    <nav className="b2-dock" aria-label="Navegación principal">
      {visible.map((link, index) => {
        const Icon = link.icon;
        return <button type="button" key={link.id} className={index >= 4 ? "b2-wideitem" : ""}
          aria-current={section === link.id || active === link.id ? "page" : undefined} onClick={() => onNavigate(link.id)}>
          <Icon /><span>{link.label}</span>
        </button>;
      })}
      <button type="button" className="b2-moreitem" aria-current={active === "more" ? "page" : undefined} onClick={() => onNavigate("more")}>
        <Grid2x2 /><span>Más</span>
      </button>
    </nav>
  </div>;
}

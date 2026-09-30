export type Section = "today" | "recipes" | "production" | "orders" | "stock" | "team" | "events" | "more";

const links: { id: Section; label: string; icon: string }[] = [
  { id: "today", label: "Hoy", icon: "◌" },
  { id: "recipes", label: "Recetas", icon: "▤" },
  { id: "production", label: "Cocina", icon: "▦" },
  { id: "orders", label: "Pedidos", icon: "◫" },
  { id: "stock", label: "Stock", icon: "▣" },
  { id: "team", label: "Equipo", icon: "♧" },
  { id: "events", label: "Eventos", icon: "▥" },
];

export function BottomNav({ section, onNavigate }: { section: Section; onNavigate: (section: Section) => void }) {
  return (
    <nav className="dock" aria-label="Navegación principal">
      {links.map((link, index) => (
        <button
          className={index > 3 ? "desktop-link" : ""}
          type="button"
          key={link.id}
          aria-current={section === link.id ? "page" : undefined}
          onClick={() => onNavigate(link.id)}
        >
          <span aria-hidden="true">{link.icon}</span><small>{link.label}</small>
        </button>
      ))}
      <button className="mobile-more" type="button" aria-current={section === "more" ? "page" : undefined} onClick={() => onNavigate("more")}>
        <span aria-hidden="true">☷</span><small>Más</small>
      </button>
    </nav>
  );
}

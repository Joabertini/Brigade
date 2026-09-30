import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

export function Tag({ children, kind = "" }: { children: ReactNode; kind?: "" | "warn" | "neutral" }) {
  return <span className={`b2-tag ${kind}`}><span className="b2-dot" />{children}</span>;
}

export function PageHead({ eyebrow, title, sub }: { eyebrow: string; title: ReactNode; sub?: ReactNode }) {
  return <div className="b2-pagehead"><div className="b2-eyebrow">{eyebrow}</div><h1>{title}</h1>{sub && <p className="b2-sub">{sub}</p>}</div>;
}

export function Back({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button type="button" className="b2-link b2-back" onClick={onClick}><ArrowLeft />{children}</button>;
}

export function Button({ children, onClick, full = false, quiet = false, disabled = false, type = "button", small = false }: {
  children: ReactNode; onClick?: () => void; full?: boolean; quiet?: boolean; disabled?: boolean; type?: "button" | "submit"; small?: boolean;
}) {
  return <button type={type} className={`b2-button${full ? " full" : ""}${quiet ? " quiet" : ""}${small ? " small" : ""}`} onClick={onClick} disabled={disabled}>{children}</button>;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return children ? <p className="b2-error" role="alert">{children}</p> : null;
}

export function Toast({ children }: { children: ReactNode }) {
  return children ? <div className="b2-toast" role="status">{children}</div> : null;
}

export function initials(name?: string) {
  return name?.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "BC";
}

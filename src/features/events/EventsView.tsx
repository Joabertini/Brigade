import { useState } from "react";
import { ArrowUpRight, Pencil, Plus } from "lucide-react";
import type { LocalEvent, LocalProduction } from "../../local-db";
import { Button, ErrorNote, PageHead, Tag } from "../../components/ui";

const eventDate = new Intl.DateTimeFormat("es-UY", { weekday: "short", day: "2-digit", month: "long" });

export function EventsView({ events, productions, canEdit, onSave, onSaved, onOpenProduction }: {
  events: LocalEvent[];
  productions: LocalProduction[];
  canEdit: boolean;
  onSave: (event: LocalEvent) => Promise<void>;
  onSaved: () => void;
  onOpenProduction: (id: string) => void;
}) {
  const [editing, setEditing] = useState<LocalEvent | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [guests, setGuests] = useState("");
  const [notes, setNotes] = useState("");

  function open(event?: LocalEvent) {
    setEditing(event ?? null);
    setName(event?.name ?? "");
    setDate(event?.eventDate ?? "");
    setGuests(event?.guestCount === null || event?.guestCount === undefined ? "" : String(event.guestCount));
    setNotes(event?.notes ?? "");
    setError("");
    setFormOpen(true);
  }

  async function save(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setError("");
    const guestCount = guests.trim() ? Number(guests) : null;
    if (guestCount !== null && (!Number.isSafeInteger(guestCount) || guestCount < 0)) {
      setError("Los comensales deben ser un número entero positivo.");
      return;
    }
    try {
      await onSave({ id: editing?.id ?? "", name: name.trim(), eventDate: date, guestCount, notes: notes.trim() });
      setFormOpen(false);
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar el evento"); }
  }

  const form = formOpen && <div className="b2-panel">
    <h2>{editing ? "Editar evento" : "Nuevo evento"}</h2>
    <form onSubmit={save}>
      <label className="b2-field">Nombre u ocasión<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
      <div className="b2-formrow">
        <label className="b2-field">Fecha<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
        <label className="b2-field">Comensales<input type="number" min="0" inputMode="numeric" value={guests} onChange={(event) => setGuests(event.target.value)} /></label>
      </div>
      <label className="b2-field">Notas<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
      <ErrorNote>{error}</ErrorNote>
      <div className="b2-actions"><Button full type="submit">Guardar evento</Button><Button quiet onClick={() => setFormOpen(false)}>Cancelar</Button></div>
    </form>
  </div>;

  return <section>
    <PageHead eyebrow="EVENTOS" title="Eventos." sub="Una ocasión más en tu cocina." />
    {!editing && form}
    {events.length ? events.map((event) => {
      const linked = productions.filter((production) => production.eventId === event.id);
      return <div key={event.id}>
        <article className="b2-focus" style={{ marginBottom: 18 }}>
          <div className="b2-row"><Tag>{event.eventDate ? eventDate.format(new Date(event.eventDate + "T12:00:00")) : "Sin fecha"}</Tag></div>
          <h2 className="b2-dish">{event.name}</h2>
          <div className="b2-facts"><div><b>{event.guestCount ?? "—"}</b><span>Comensales</span></div><div><b>{linked.length}</b><span>Producciones</span></div></div>
          {event.notes && <p className="b2-sub" style={{ marginBottom: 18 }}>{event.notes}</p>}
          {linked.map((production) => <button type="button" className="b2-link" key={production.id} onClick={() => onOpenProduction(production.id)}>{production.recipe.title} <ArrowUpRight /></button>)}
          {canEdit && <div className="b2-actions"><Button full quiet onClick={() => open(event)}><Pencil /> Editar evento</Button></div>}
        </article>
        {editing?.id === event.id && form}
      </div>;
    }) : <div className="b2-empty"><h2>No hay eventos aún</h2><p className="b2-sub">Recetas y producciones no necesitan un evento para existir.</p></div>}
    {canEdit && <div className="b2-actions"><Button full onClick={() => open()}><Plus /> Nuevo evento</Button></div>}
  </section>;
}

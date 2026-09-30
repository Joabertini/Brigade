import { useState } from "react";
import type { LocalEvent, LocalProduction } from "../../local-db";

export function EventsView({ events, productions, canEdit, onSave, onSaved }: {
  events: LocalEvent[];
  productions: LocalProduction[];
  canEdit: boolean;
  onSave: (event: LocalEvent) => Promise<void>;
  onSaved: () => void;
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

  return <section>
    <p className="eyebrow">EVENTOS · CONTEXTO OPCIONAL</p>
    <div className="row spread"><h1>Eventos.</h1>{canEdit && <button className="secondary" onClick={() => open()}>+ Nuevo</button>}</div>
    <p className="lead">La cocina funciona todos los días. Vinculá una producción a un evento cuando corresponda.</p>
    {formOpen && <div className="panel event-form">
      <h2>{editing ? "Editar evento" : "Nuevo evento"}</h2>
      <form onSubmit={save}>
        <label className="field">Nombre u ocasión<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <div className="form-row">
          <label className="field">Fecha<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
          <label className="field">Comensales<input type="number" min="0" inputMode="numeric" value={guests} onChange={(event) => setGuests(event.target.value)} /></label>
        </div>
        <label className="field">Notas<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row"><button className="primary" type="submit">Guardar evento</button><button className="text-button" type="button" onClick={() => setFormOpen(false)}>Cancelar</button></div>
      </form>
    </div>}
    {events.length ? <div className="event-grid">{events.map((event) => {
      const linked = productions.filter((production) => production.eventId === event.id);
      return <div className="event-card" key={event.id}>
        <span className="eyebrow">{event.eventDate}</span>
        <h2 className="dish">{event.name}</h2>
        <p className="muted">{event.guestCount === null ? "Comensales por definir" : event.guestCount + " comensales"} · {linked.length} producciones vinculadas</p>
        {event.notes && <p>{event.notes}</p>}
        {canEdit && <button className="text-button" onClick={() => open(event)}>Editar →</button>}
      </div>;
    })}</div> : <div className="empty"><h2>No hay eventos aún.</h2><p>Las recetas y producciones no necesitan un evento para existir.</p></div>}
  </section>;
}

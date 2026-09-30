import { useState } from "react";
import { formatMilli, parseMilli, scaleRecipe } from "../../../shared/kitchen";
import type { LocalEvent, LocalProduction, LocalRecipe } from "../../local-db";

export function ProductionView({ recipes, productions, events, requestedRecipe, cloudMode, canPlan, onPlan, onRecord, onSaved }: {
  recipes: LocalRecipe[];
  productions: LocalProduction[];
  events: LocalEvent[];
  requestedRecipe: LocalRecipe | null;
  cloudMode: boolean;
  canPlan: boolean;
  onPlan: (recipe: LocalRecipe, targetYieldMilli: number, plannedFor: string, eventId?: string) => Promise<void>;
  onRecord: (production: LocalProduction, amountMilli: number) => Promise<void>;
  onSaved: () => void;
}) {
  const [selectedRecipeId, setSelectedRecipeId] = useState("");
  const [targetText, setTargetText] = useState("");
  const [plannedFor, setPlannedFor] = useState("");
  const [eventId, setEventId] = useState("");
  const [selectedProductionId, setSelectedProductionId] = useState("");
  const [batchText, setBatchText] = useState("");
  const [error, setError] = useState("");
  const selectedRecipe = recipes.find((recipe) => recipe.id === selectedRecipeId) ?? requestedRecipe;
  const production = productions.find((entry) => entry.id === selectedProductionId) ?? productions[0];
  let scaled: ReturnType<typeof scaleRecipe> = [];
  if (selectedRecipe && targetText) {
    try { scaled = scaleRecipe(selectedRecipe.version, parseMilli(targetText)); } catch { /* form shows validation on submit */ }
  }

  async function plan(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (!selectedRecipe) throw new Error("Elegí una receta");
      const targetYieldMilli = parseMilli(targetText);
      scaleRecipe(selectedRecipe.version, targetYieldMilli);
      await onPlan(selectedRecipe, targetYieldMilli, plannedFor, eventId || undefined);
      setTargetText("");
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo planificar"); }
  }

  async function record(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (!production) return;
      const amountMilli = parseMilli(batchText);
      await onRecord(production, amountMilli);
      setBatchText("");
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo registrar"); }
  }

  return <section>
    <p className="eyebrow">COCINA · PRODUCCIÓN</p>
    <h1>Preparar con<br />precisión.</h1>
    <div className="two-column">
      <div className="panel">
        <h2>Planificar producción</h2>
        {!canPlan ? <p className="muted">Tu rol puede consultar la producción asignada y registrar tandas autorizadas.</p> : recipes.length ? <form onSubmit={plan}>
          <label className="field">Receta
            <select value={selectedRecipe?.id ?? ""} onChange={(event) => setSelectedRecipeId(event.target.value)} required>
              <option value="">Elegí una receta</option>
              {recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.version.title}</option>)}
            </select>
          </label>
          {selectedRecipe && <p className="muted">Base: {formatMilli(selectedRecipe.version.yieldMilli, selectedRecipe.version.yieldUnit)}</p>}
          <label className="field">Rendimiento objetivo {selectedRecipe?.version.yieldUnit ?? ""}
            <input inputMode="decimal" value={targetText} onChange={(event) => setTargetText(event.target.value)} placeholder="40" required />
          </label>
          <label className="field">Fecha prevista<input type="date" value={plannedFor} onChange={(event) => setPlannedFor(event.target.value)} /></label>
          <label className="field">Evento opcional
            <select value={eventId} onChange={(event) => setEventId(event.target.value)}>
              <option value="">Producción cotidiana</option>
              {events.map((event) => <option key={event.id} value={event.id}>{event.name} · {event.eventDate}</option>)}
            </select>
          </label>
          {scaled.length > 0 && <div className="preview"><h3>Cantidades para esta producción</h3>{scaled.map((ingredient) => <div className="line-item" key={ingredient.id}><span>{ingredient.name}</span><strong>{formatMilli(ingredient.requiredNetMilli, ingredient.unit)} neto<br /><small>{formatMilli(ingredient.requiredGrossMilli, ingredient.unit)} bruto</small></strong></div>)}</div>}
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" type="submit">Guardar plan de producción</button>
        </form> : <p className="muted">Primero guardá una receta con rendimiento e ingredientes.</p>}
      </div>
      <div>
        <h2>Producciones</h2>
        {productions.length ? <>
          <div className="production-list">{productions.map((entry) => <button key={entry.id} className="production-card" aria-pressed={production?.id === entry.id} onClick={() => setSelectedProductionId(entry.id)}>
            <span className="dish">{entry.recipe.title}</span>
            <span>{formatMilli(entry.producedYieldMilli, entry.recipe.yieldUnit)} / {formatMilli(entry.targetYieldMilli, entry.recipe.yieldUnit)}</span>
          </button>)}</div>
          {production && <div className="panel">
            <p className="eyebrow">REGISTRO DE TANDA</p>
            <h2 className="dish">{production.recipe.title}</h2>
            <p className="muted">Versión {production.recipe.version} conservada al planificar. Total: {formatMilli(production.producedYieldMilli, production.recipe.yieldUnit)}.</p>
            <form onSubmit={record}>
              <label className="field">Cantidad producida en esta tanda ({production.recipe.yieldUnit})<input inputMode="decimal" value={batchText} onChange={(event) => setBatchText(event.target.value)} required /></label>
              <button className="primary" type="submit">{cloudMode ? "Registrar tanda" : "Registrar tanda en este dispositivo"}</button>
            </form>
            {production.entries.length > 0 && <div className="preview"><h3>Registro</h3>{production.entries.map((entry) => <div className="line-item" key={entry.id}><span>{new Date(entry.at).toLocaleString("es-UY")}</span><strong>+ {formatMilli(entry.amountMilli, production.recipe.yieldUnit)}</strong></div>)}</div>}
          </div>}
        </> : <div className="empty"><h2>No hay producciones todavía.</h2><p>Planificá una desde una receta del recetario.</p></div>}
      </div>
    </div>
    <p className="footnote">{cloudMode ? "Sin conexión, la tanda queda pendiente y se sincroniza al volver la red. El número se aplica una sola vez." : "Estos registros son locales y todavía no se comparten con el equipo."}</p>
  </section>;
}

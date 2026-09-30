import { useState } from "react";
import { formatMilli, parseMilli } from "../../../shared/kitchen";
import type { CatalogIngredient, StockMovement, StockUnit } from "../../data/repository";

export function StockView({ ingredients, movements, cloudMode, canEdit, online, onCreate, onMovement, onSaved }: {
  ingredients: CatalogIngredient[];
  movements: StockMovement[];
  cloudMode: boolean;
  canEdit: boolean;
  online: boolean;
  onCreate: (name: string, unit: StockUnit) => Promise<void>;
  onMovement: (ingredientId: string, deltaMilli: number, kind: StockMovement["kind"], note: string) => Promise<void>;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<StockUnit>("g");
  const [ingredientId, setIngredientId] = useState("");
  const [movementType, setMovementType] = useState<"received" | "consumed" | "adjustment_up" | "adjustment_down">("received");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(event: React.FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try { await onCreate(name.trim(), unit); setName(""); onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo agregar el ingrediente"); }
    finally { setBusy(false); }
  }

  async function record(event: React.FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const amount = parseMilli(quantity);
      const kind: StockMovement["kind"] = movementType === "received" ? "received" : movementType === "consumed" ? "consumed" : "adjustment";
      const delta = movementType === "consumed" || movementType === "adjustment_down" ? -amount : amount;
      await onMovement(ingredientId, delta, kind, note.trim());
      setQuantity(""); setNote(""); onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo registrar el movimiento"); }
    finally { setBusy(false); }
  }

  const selected = ingredients.find((item) => item.id === ingredientId);
  return <section>
    <p className="eyebrow">INVENTARIO · MOVIMIENTOS TRAZABLES</p>
    <h1>Stock.</h1>
    <p className="lead">Cada ingrediente tiene una unidad base. Las entradas y consumos quedan en un historial, sin sobrescribir el saldo.</p>
    {!cloudMode && <p className="sync-banner">Conectá tu cocina para registrar stock compartido con el equipo.</p>}
    {cloudMode && !online && <p className="sync-banner">Vista guardada para consulta. Reconectate para ingresar movimientos.</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="two-column">
      <div>
        <h2>Ingredientes</h2>
        {ingredients.length ? <div className="panel">{ingredients.map((item) => <div className="line-item" key={item.id}>
          <span>{item.name}</span><strong>{formatMilli(item.availableMilli, item.baseUnit)}</strong>
        </div>)}</div> : <div className="empty"><h2>Inventario vacío.</h2><p>Agregá los ingredientes que querés controlar, con la unidad en la que se cuentan.</p></div>}
      </div>
      <div>
        {canEdit && cloudMode && <>
          <div className="panel stock-form">
            <h2>Agregar ingrediente</h2>
            <form onSubmit={create}>
              <label className="field">Nombre<input value={name} maxLength={200} onChange={(event) => setName(event.target.value)} required /></label>
              <label className="field">Unidad base<select value={unit} onChange={(event) => setUnit(event.target.value as StockUnit)}>
                <option value="g">Gramos</option><option value="ml">Mililitros</option><option value="un">Unidades</option>
                <option value="atado">Atados</option><option value="paq">Paquetes</option><option value="bandeja">Bandejas</option>
              </select></label>
              <button className="secondary" disabled={busy || !online}>Agregar</button>
            </form>
          </div>
          <div className="panel stock-form">
            <h2>Registrar movimiento</h2>
            <form onSubmit={record}>
              <label className="field">Ingrediente<select value={ingredientId} onChange={(event) => setIngredientId(event.target.value)} required>
                <option value="">Seleccionar ingrediente</option>{ingredients.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
              </select></label>
              <div className="stock-form-row">
                <label className="field">Tipo<select value={movementType} onChange={(event) => setMovementType(event.target.value as typeof movementType)}>
                  <option value="received">Entrada</option><option value="consumed">Consumo</option><option value="adjustment_up">Ajuste positivo</option><option value="adjustment_down">Ajuste negativo</option>
                </select></label>
                <label className="field">Cantidad{selected ? ` (${selected.baseUnit})` : ""}<input inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="0,000" required /></label>
              </div>
              <label className="field">Nota<input value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder="Ej. recepción del proveedor" /></label>
              <button className="primary" disabled={busy || !online || !ingredients.length}>Guardar movimiento</button>
            </form>
          </div>
        </>}
      </div>
    </div>
    <h2 className="stock-history-title">Últimos movimientos</h2>
    {movements.length ? <div className="panel">{movements.map((movement) => <div className="line-item" key={movement.operationId}>
      <span>{movement.ingredientName}<br /><small>{movement.kind === "received" ? "Entrada" : movement.kind === "consumed" ? "Consumo" : "Ajuste"} · {new Date(movement.recordedAt).toLocaleDateString("es-UY")}{movement.note ? ` · ${movement.note}` : ""}</small></span>
      <strong>{movement.deltaMilli > 0 ? "+" : "−"}{formatMilli(Math.abs(movement.deltaMilli), movement.baseUnit)}</strong>
    </div>)}</div> : <p className="muted">Todavía no hay movimientos.</p>}
  </section>;
}

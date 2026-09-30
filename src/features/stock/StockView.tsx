import { useState } from "react";
import { PackagePlus, Plus } from "lucide-react";
import { formatStock, parseMilli } from "../../../shared/kitchen";
import type { CatalogIngredient, StockMovement, StockUnit } from "../../data/repository";
import { Button, ErrorNote, PageHead, Toast } from "../../components/ui";

const unitNames: Record<StockUnit, string> = { g: "Gramos", ml: "Mililitros", un: "Unidades", atado: "Atados", paq: "Paquetes", bandeja: "Bandejas" };
const kindText: Record<StockMovement["kind"], string> = { received: "Entrada", consumed: "Consumo", adjustment: "Ajuste" };

export function StockView({ ingredients, movements, cloudMode, canEdit, online, lastSync, onCreate, onMovement, onSaved }: {
  ingredients: CatalogIngredient[];
  movements: StockMovement[];
  cloudMode: boolean;
  canEdit: boolean;
  online: boolean;
  lastSync: Date | null;
  onCreate: (name: string, unit: StockUnit) => Promise<void>;
  onMovement: (ingredientId: string, deltaMilli: number, kind: StockMovement["kind"], note: string) => Promise<void>;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<"" | "movement" | "ingredient">("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<StockUnit>("g");
  const [ingredientId, setIngredientId] = useState("");
  const [movementType, setMovementType] = useState<"received" | "consumed" | "adjustment_up" | "adjustment_down">("received");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(event: React.FormEvent) {
    event.preventDefault(); setError(""); setInfo(""); setBusy(true);
    try { await onCreate(name.trim(), unit); setName(""); setForm(""); setInfo("Ingrediente agregado."); onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo agregar el ingrediente"); }
    finally { setBusy(false); }
  }

  async function record(event: React.FormEvent) {
    event.preventDefault(); setError(""); setInfo(""); setBusy(true);
    try {
      const amount = parseMilli(quantity);
      const kind: StockMovement["kind"] = movementType === "received" ? "received" : movementType === "consumed" ? "consumed" : "adjustment";
      const delta = movementType === "consumed" || movementType === "adjustment_down" ? -amount : amount;
      await onMovement(ingredientId, delta, kind, note.trim());
      setQuantity(""); setNote(""); setForm(""); setInfo("Movimiento registrado."); onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo registrar el movimiento"); }
    finally { setBusy(false); }
  }

  const selected = ingredients.find((item) => item.id === ingredientId);
  const updated = lastSync ? `Última actualización ${lastSync.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hour12: false })}` : "Sin sincronizar";
  return <section>
    <PageHead eyebrow="EXISTENCIAS" title="Ingredientes." sub={`Stock utilizable · ${updated}`} />
    {!cloudMode && <div className="b2-offline">Conectá tu cocina para registrar stock compartido con el equipo.</div>}
    {cloudMode && !online && <div className="b2-offline">Vista guardada para consulta. Reconectate para ingresar movimientos.</div>}
    <ErrorNote>{error}</ErrorNote>
    <Toast>{info}</Toast>
    {ingredients.length ? ingredients.map((item) => <div className="b2-productline" key={item.id}>
      <div className="b2-row"><h3>{item.name}</h3><span style={{ fontSize: 24, fontVariantNumeric: "tabular-nums" }}>{formatStock(item.availableMilli, item.baseUnit)}</span></div>
      <span className="b2-muted">{unitNames[item.baseUnit]}</span>
    </div>) : <div className="b2-empty"><h2>Inventario vacío</h2><p className="b2-sub">Agregá los ingredientes que querés controlar, con la unidad en la que se cuentan.</p></div>}
    {canEdit && cloudMode && <>
      <div className="b2-actions">
        <Button full disabled={!ingredients.length} onClick={() => setForm(form === "movement" ? "" : "movement")}><PackagePlus /> Registrar entrada</Button>
        <Button full quiet onClick={() => setForm(form === "ingredient" ? "" : "ingredient")}><Plus /> Agregar ingrediente</Button>
      </div>
      {form === "movement" && <div className="b2-panel">
        <h2>{movementType === "received" ? "Entrada de stock" : "Movimiento de stock"}</h2>
        <form onSubmit={record}>
          <label className="b2-field">Ingrediente<select value={ingredientId} onChange={(event) => setIngredientId(event.target.value)} required>
            <option value="">Elegí un ingrediente</option>{ingredients.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select></label>
          <div className="b2-formrow">
            <label className="b2-field">Tipo<select value={movementType} onChange={(event) => setMovementType(event.target.value as typeof movementType)}>
              <option value="received">Entrada</option><option value="consumed">Consumo</option><option value="adjustment_up">Ajuste positivo</option><option value="adjustment_down">Ajuste negativo</option>
            </select></label>
            <label className="b2-field">Cantidad{selected ? ` · ${selected.baseUnit}` : ""}<input inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="0" required /></label>
          </div>
          <label className="b2-field">Nota<input value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder="Por ejemplo: recepción del proveedor" /></label>
          <Button full type="submit" disabled={busy || !online}>Confirmar movimiento</Button>
        </form>
      </div>}
      {form === "ingredient" && <div className="b2-panel">
        <h2>Nuevo ingrediente</h2>
        <form onSubmit={create}>
          <label className="b2-field">Nombre<input value={name} maxLength={200} onChange={(event) => setName(event.target.value)} required /></label>
          <label className="b2-field">Unidad en que se cuenta<select value={unit} onChange={(event) => setUnit(event.target.value as StockUnit)}>
            {(Object.keys(unitNames) as StockUnit[]).map((key) => <option value={key} key={key}>{unitNames[key]}</option>)}
          </select></label>
          <Button full type="submit" disabled={busy || !online}>Agregar</Button>
        </form>
      </div>}
    </>}
    {movements.length > 0 && <details className="b2-panel"><summary>Últimos movimientos · {movements.length}</summary>
      {movements.map((movement) => <div className="b2-ingredient" key={movement.operationId}>
        <span>{movement.ingredientName}<small>{kindText[movement.kind]} · {new Date(movement.recordedAt).toLocaleDateString("es-UY")}{movement.note ? ` · ${movement.note}` : ""}</small></span>
        <b>{movement.deltaMilli > 0 ? "+" : "−"}{formatStock(Math.abs(movement.deltaMilli), movement.baseUnit)}</b>
      </div>)}
    </details>}
  </section>;
}

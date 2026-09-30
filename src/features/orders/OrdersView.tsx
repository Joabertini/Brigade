import { useEffect, useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { formatMilli, formatStock, parseMilli } from "../../../shared/kitchen";
import type { CatalogIngredient, PurchaseOrder, Requirements, Supplier } from "../../data/repository";
import { Button, ErrorNote, PageHead, Tag, Toast } from "../../components/ui";

type DraftLine = { id: string; ingredientId: string; quantity: string; note: string };
const statusText: Record<PurchaseOrder["status"], string> = {
  draft: "Borrador", sent: "Enviado", confirmed: "Confirmado", received: "Recibido", cancelled: "Cancelado",
};

function orderText(order: PurchaseOrder): string {
  return [
    `Pedido de Brigade para ${order.supplierName}`,
    ...order.lines.map((line) => `• ${line.ingredientName}: ${formatStock(line.quantityMilli, line.unit)}${line.note ? ` — ${line.note}` : ""}`),
    ...(order.note ? [`Nota: ${order.note}`] : []),
  ].join("\n");
}

const emptyLine = (): DraftLine => ({ id: crypto.randomUUID(), ingredientId: "", quantity: "", note: "" });

export function OrdersView({ suppliers, ingredients, orders, requirements, cloudMode, canEdit, online, onSupplier, onOrder, onStatus, onReceipt, onSaved }: {
  suppliers: Supplier[];
  ingredients: CatalogIngredient[];
  orders: PurchaseOrder[];
  requirements: Requirements;
  cloudMode: boolean;
  canEdit: boolean;
  online: boolean;
  onSupplier: (name: string, contact: string) => Promise<void>;
  onOrder: (supplierId: string, lines: { ingredientId: string; quantityMilli: number; note: string }[], note: string, orderId: string) => Promise<void>;
  onStatus: (orderId: string, status: "sent" | "confirmed" | "cancelled") => Promise<void>;
  onReceipt: (orderId: string, lines: { lineId: string; quantityMilli: number }[], operationId: string) => Promise<void>;
  onSaved: () => void;
}) {
  const shortages = requirements.needs.filter((need) => need.shortageMilli > 0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [shortageSupplier, setShortageSupplier] = useState("");
  const [shortageOrderId, setShortageOrderId] = useState(() => crypto.randomUUID());
  const [supplierName, setSupplierName] = useState("");
  const [supplierContact, setSupplierContact] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [draftNote, setDraftNote] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [reviewId, setReviewId] = useState("");
  const [receiptOrderId, setReceiptOrderId] = useState("");
  const [receiptOperationId, setReceiptOperationId] = useState(() => crypto.randomUUID());
  const [receiptAmounts, setReceiptAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setPicked(new Set(shortages.map((need) => need.ingredientId))); }, [shortages.map((need) => need.ingredientId).join()]);

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true); setError(""); setInfo("");
    try { await action(); setInfo(success); onSaved(); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo completar la operación"); return false; }
    finally { setBusy(false); }
  }

  async function orderShortages() {
    const chosen = shortages.filter((need) => picked.has(need.ingredientId));
    if (!shortageSupplier || !chosen.length) { setError("Elegí proveedor y al menos un faltante."); return; }
    const payload = chosen.map((need) => ({ ingredientId: need.ingredientId, quantityMilli: need.shortageMilli, note: "" }));
    if (await run(() => onOrder(shortageSupplier, payload, "Faltantes de producción", shortageOrderId), "Borrador creado con los faltantes elegidos.")) {
      setShortageOrderId(crypto.randomUUID());
    }
  }

  async function saveSupplier(event: React.FormEvent) {
    event.preventDefault();
    if (await run(() => onSupplier(supplierName.trim(), supplierContact.trim()), "Proveedor guardado")) {
      setSupplierName(""); setSupplierContact("");
    }
  }

  async function saveOrder(event: React.FormEvent) {
    event.preventDefault();
    let prepared: { ingredientId: string; quantityMilli: number; note: string }[];
    try {
      prepared = lines.map((line) => ({ ingredientId: line.ingredientId, quantityMilli: parseMilli(line.quantity), note: line.note.trim() }));
      if (prepared.some((line) => !line.ingredientId) || new Set(prepared.map((line) => line.ingredientId)).size !== prepared.length) {
        throw new Error("Elegí ingredientes distintos para cada línea.");
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Cantidad inválida"); return; }
    if (await run(() => onOrder(supplierId, prepared, draftNote.trim(), draftId), "Borrador guardado")) {
      setDraftId(crypto.randomUUID()); setDraftNote(""); setLines([emptyLine()]);
    }
  }

  async function share(order: PurchaseOrder) {
    setError(""); setInfo("");
    const text = orderText(order);
    try {
      if (navigator.share) {
        await navigator.share({ title: `Pedido para ${order.supplierName}`, text });
        setInfo("Revisá que el proveedor haya recibido el mensaje y después confirmá el envío.");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setInfo("Pedido copiado. Pegalo en el canal del proveedor y, al enviarlo, confirmá el envío.");
      } else {
        setInfo("Copiá el texto del pedido que aparece debajo.");
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError("No se pudo abrir el menú para compartir. Copiá el texto del pedido.");
    }
  }

  async function receive(event: React.FormEvent, order: PurchaseOrder) {
    event.preventDefault();
    let prepared: { lineId: string; quantityMilli: number }[];
    try {
      prepared = order.lines.flatMap((line) => {
        const value = receiptAmounts[line.id]?.trim();
        return value ? [{ lineId: line.id, quantityMilli: parseMilli(value) }] : [];
      });
      if (!prepared.length) throw new Error("Ingresá lo que llegó en esta entrega.");
      for (const line of prepared) {
        const ordered = order.lines.find((item) => item.id === line.lineId)!;
        if (line.quantityMilli > ordered.quantityMilli - ordered.receivedMilli) throw new Error(`La cantidad de ${ordered.ingredientName} supera lo pendiente.`);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Recepción inválida"); return; }
    if (await run(() => onReceipt(order.id, prepared, receiptOperationId), "Recepción registrada y stock actualizado")) {
      setReceiptOrderId(""); setReceiptAmounts({}); setReceiptOperationId(crypto.randomUUID());
    }
  }

  const active = orders.filter((order) => order.status !== "received" && order.status !== "cancelled");
  const closed = orders.filter((order) => order.status === "received" || order.status === "cancelled");

  function renderOrder(order: PurchaseOrder) {
    return <article className="b2-order" key={order.id}>
      <div className="b2-row"><span className="b2-eyebrow">PROVEEDOR</span><Tag kind={order.status === "draft" ? "warn" : order.status === "cancelled" ? "neutral" : ""}>{statusText[order.status]}</Tag></div>
      <h2>{order.supplierName}</h2>
      {order.lines.map((line) => <div className="b2-ingredient" key={line.id}>
        <span>{line.ingredientName}{line.note && <small>{line.note}</small>}{line.receivedMilli > 0 && <small>Recibido: {formatStock(line.receivedMilli, line.unit)}</small>}</span>
        <b>{formatStock(line.quantityMilli, line.unit)}</b>
      </div>)}
      <p className="b2-sub">{order.note ? `${order.note} · ` : ""}{order.supplierContact ? `Contacto: ${order.supplierContact}` : "Precio, presentación y entrega por confirmar."}</p>
      {canEdit && order.status === "draft" && <div className="b2-actions">
        {reviewId !== order.id ? <Button full onClick={() => setReviewId(order.id)}>Revisar antes de enviar <ArrowRight /></Button> : <div className="b2-panel" style={{ width: "100%", margin: 0 }}>
          <h2>Enviar a {order.supplierName}</h2>
          <p className="b2-sub">Compartí el pedido por el canal del proveedor. Confirmá el envío solo después de mandarlo.</p>
          {!online && <div className="b2-offline" style={{ marginTop: 14 }}>Sin conexión. El pedido queda en borrador.</div>}
          <div className="b2-actions">
            <Button full quiet disabled={!online} onClick={() => void share(order)}>Compartir pedido</Button>
            <Button full disabled={busy || !online} onClick={() => void run(() => onStatus(order.id, "sent"), "Pedido marcado como enviado")}>Confirmar envío</Button>
          </div>
          <textarea className="b2-copy" readOnly value={orderText(order)} aria-label={`Texto del pedido a ${order.supplierName}`} />
        </div>}
      </div>}
      {canEdit && order.status === "sent" && <div className="b2-actions"><Button full disabled={busy || !online} onClick={() => void run(() => onStatus(order.id, "confirmed"), "Confirmación registrada")}>Registrar confirmación</Button></div>}
      {canEdit && (order.status === "sent" || order.status === "confirmed") && <>
        <div className="b2-actions"><Button full quiet disabled={!online} onClick={() => { setReceiptOrderId(receiptOrderId === order.id ? "" : order.id); setReceiptAmounts({}); setReceiptOperationId(crypto.randomUUID()); }}>Registrar recepción</Button></div>
        {receiptOrderId === order.id && <form onSubmit={(event) => void receive(event, order)}>
          <p className="b2-sub">Anotá solo lo que llegó en esta entrega. Dejá vacío lo que no llegó.</p>
          {order.lines.filter((line) => line.receivedMilli < line.quantityMilli).map((line) => <label className="b2-field" key={line.id}>{line.ingredientName} · pendiente {formatMilli(line.quantityMilli - line.receivedMilli, line.unit)} · ingresá en {line.unit}<input inputMode="decimal" value={receiptAmounts[line.id] ?? ""} onChange={(event) => setReceiptAmounts({ ...receiptAmounts, [line.id]: event.target.value })} placeholder="Cantidad recibida" /></label>)}
          <Button full type="submit" disabled={busy || !online}>Guardar recepción</Button>
        </form>}
      </>}
      {canEdit && ["draft", "sent", "confirmed"].includes(order.status) && <button type="button" className="b2-link" disabled={busy || !online} onClick={() => void run(() => onStatus(order.id, "cancelled"), "Pedido cancelado")}>Cancelar pedido</button>}
    </article>;
  }

  return <section>
    <PageHead eyebrow="COMPRAS A PROVEEDORES" title="Pedidos." sub="Cantidades para las producciones abiertas." />
    {!cloudMode && <div className="b2-offline">Conectá tu cocina para administrar pedidos compartidos.</div>}
    <ErrorNote>{error}</ErrorNote>
    <Toast>{info}</Toast>
    {cloudMode && canEdit && <>
      <div className="b2-row"><span className="b2-muted">{shortages.length ? `${shortages.length} ${shortages.length === 1 ? "ingrediente" : "ingredientes"} por comprar` : "Stock y pedidos cubren la producción"}</span>{shortages.length > 0 && <Tag kind="warn">Faltantes</Tag>}</div>
      {shortages.length > 0 ? <article className="b2-order">
        <span className="b2-eyebrow">PARA PRODUCIR</span>
        <h2>Faltantes</h2>
        {shortages.map((need) => <label className="b2-ingredient" key={need.ingredientId}>
          <span style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <input type="checkbox" style={{ width: 20, height: 20, accentColor: "var(--b-accent)", flexShrink: 0, margin: "2px 0" }} checked={picked.has(need.ingredientId)}
              onChange={() => { const next = new Set(picked); if (next.has(need.ingredientId)) next.delete(need.ingredientId); else next.add(need.ingredientId); setPicked(next); }} />
            <span>{need.name}<small>Necesario {formatStock(need.requiredMilli, need.unit)} · stock {formatStock(need.availableMilli, need.unit)}{need.incomingMilli ? ` · pedido ${formatStock(need.incomingMilli, need.unit)}` : ""}</small></span>
          </span>
          <b>{formatStock(need.shortageMilli, need.unit)}</b>
        </label>)}
        <label className="b2-field">Proveedor<select value={shortageSupplier} onChange={(event) => setShortageSupplier(event.target.value)}>
          <option value="">{suppliers.length ? "Elegí un proveedor" : "Agregá un proveedor abajo"}</option>
          {suppliers.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}
        </select></label>
        <Button full disabled={busy || !online || !shortageSupplier || !picked.size} onClick={() => void orderShortages()}>Crear borrador con {picked.size} {picked.size === 1 ? "faltante" : "faltantes"} <ArrowRight /></Button>
      </article> : <div className="b2-empty"><h2>Todo cubierto</h2><p className="b2-sub">No hay faltantes para las producciones abiertas.</p></div>}
      {requirements.unlinked.length > 0 && <div className="b2-callout"><strong>Sin vínculo con stock</strong><br />
        {[...new Set(requirements.unlinked.map((item) => item.ingredientName))].join(", ")}. Vinculalos desde la receta para incluirlos en el cálculo.</div>}
    </>}
    {active.length > 0 && <><div className="b2-overline" style={{ marginTop: 28 }}><h2>En curso</h2><span className="b2-muted">{active.length} {active.length === 1 ? "pedido" : "pedidos"}</span></div>
      <div className="b2-two">{active.map(renderOrder)}</div></>}
    {cloudMode && !active.length && !shortages.length && !orders.length && <p className="b2-sub">Todavía no hay pedidos.</p>}
    {canEdit && cloudMode && <div className="b2-two" style={{ marginTop: 18 }}>
      <details className="b2-panel"><summary><Plus style={{ marginRight: 6 }} /> Pedido manual</summary>
        <form onSubmit={saveOrder}>
          <label className="b2-field">Proveedor<select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} required>
            <option value="">Elegí un proveedor</option>{suppliers.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}
          </select></label>
          {lines.map((line, index) => {
            const update = (patch: Partial<DraftLine>) => setLines(lines.map((item) => item.id === line.id ? { ...item, ...patch } : item));
            return <div className="b2-subform" key={line.id}>
              <label className="b2-field">Producto {index + 1}<select value={line.ingredientId} onChange={(event) => update({ ingredientId: event.target.value })} required>
                <option value="">Elegí un ingrediente</option>{ingredients.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.baseUnit}</option>)}
              </select></label>
              <div className="b2-formrow">
                <label className="b2-field">Cantidad{line.ingredientId ? ` · ${ingredients.find((item) => item.id === line.ingredientId)?.baseUnit}` : ""}<input inputMode="decimal" value={line.quantity} onChange={(event) => update({ quantity: event.target.value })} required /></label>
                <label className="b2-field">Detalle<input value={line.note} onChange={(event) => update({ note: event.target.value })} placeholder="Presentación, calidad…" /></label>
              </div>
              {lines.length > 1 && <button type="button" className="b2-link" onClick={() => setLines(lines.filter((item) => item.id !== line.id))}>Quitar producto</button>}
            </div>;
          })}
          <button type="button" className="b2-link" onClick={() => setLines([...lines, emptyLine()])}><Plus /> Agregar producto</button>
          <label className="b2-field">Nota general<textarea value={draftNote} onChange={(event) => setDraftNote(event.target.value)} style={{ minHeight: 90 }} /></label>
          <Button full type="submit" disabled={busy || !online || !suppliers.length || !ingredients.length}>Guardar borrador</Button>
        </form>
      </details>
      <details className="b2-panel"><summary><Plus style={{ marginRight: 6 }} /> Nuevo proveedor</summary>
        <form onSubmit={saveSupplier}>
          <label className="b2-field">Nombre<input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} maxLength={200} required /></label>
          <label className="b2-field">Contacto o canal<input value={supplierContact} onChange={(event) => setSupplierContact(event.target.value)} maxLength={500} placeholder="WhatsApp, teléfono o email" /></label>
          <Button full quiet type="submit" disabled={busy || !online}>Guardar proveedor</Button>
        </form>
      </details>
    </div>}
    {closed.length > 0 && <details className="b2-panel"><summary>Recibidos y cancelados · {closed.length}</summary>{closed.map(renderOrder)}</details>}
    <p className="b2-footnote">Los pedidos no se envían automáticamente al reconectar.</p>
  </section>;
}

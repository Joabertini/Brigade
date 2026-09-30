import { useState } from "react";
import { formatMilli, parseMilli } from "../../../shared/kitchen";
import type { CatalogIngredient, PurchaseOrder, Supplier } from "../../data/repository";

type DraftLine = { id: string; ingredientId: string; quantity: string; note: string };
const statusText: Record<PurchaseOrder["status"], string> = {
  draft: "Borrador", sent: "Enviado", confirmed: "Confirmado", received: "Recibido", cancelled: "Cancelado",
};

function orderText(order: PurchaseOrder): string {
  return [
    `Pedido de Brigade para ${order.supplierName}`,
    ...order.lines.map((line) => `• ${line.ingredientName}: ${formatMilli(line.quantityMilli, line.unit)}${line.note ? ` — ${line.note}` : ""}`),
    ...(order.note ? [`Nota: ${order.note}`] : []),
  ].join("\n");
}

export function OrdersView({ suppliers, ingredients, orders, cloudMode, canEdit, online, onSupplier, onOrder, onStatus, onReceipt, onSaved }: {
  suppliers: Supplier[];
  ingredients: CatalogIngredient[];
  orders: PurchaseOrder[];
  cloudMode: boolean;
  canEdit: boolean;
  online: boolean;
  onSupplier: (name: string, contact: string) => Promise<void>;
  onOrder: (supplierId: string, lines: { ingredientId: string; quantityMilli: number; note: string }[], note: string, orderId: string) => Promise<void>;
  onStatus: (orderId: string, status: "sent" | "confirmed" | "cancelled") => Promise<void>;
  onReceipt: (orderId: string, lines: { lineId: string; quantityMilli: number }[], operationId: string) => Promise<void>;
  onSaved: () => void;
}) {
  const [supplierName, setSupplierName] = useState("");
  const [supplierContact, setSupplierContact] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [draftNote, setDraftNote] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ id: crypto.randomUUID(), ingredientId: "", quantity: "", note: "" }]);
  const [receiptOrderId, setReceiptOrderId] = useState("");
  const [receiptOperationId, setReceiptOperationId] = useState(() => crypto.randomUUID());
  const [receiptAmounts, setReceiptAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true); setError(""); setInfo("");
    try { await action(); setInfo(success); onSaved(); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo completar la operación"); return false; }
    finally { setBusy(false); }
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
      setDraftId(crypto.randomUUID()); setDraftNote("");
      setLines([{ id: crypto.randomUUID(), ingredientId: "", quantity: "", note: "" }]);
    }
  }

  async function share(order: PurchaseOrder) {
    setError(""); setInfo("");
    const text = orderText(order);
    try {
      if (navigator.share) {
        await navigator.share({ title: `Pedido para ${order.supplierName}`, text });
        setInfo("Revisá que el proveedor haya recibido el mensaje y después marcá el pedido como enviado.");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setInfo("Pedido copiado. Pegalo en el canal del proveedor y, al enviarlo, marcá el pedido como enviado.");
      } else {
        setInfo("Seleccioná y copiá el texto del pedido que aparece debajo.");
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError("No se pudo abrir el menú para compartir. Copiá el texto del pedido manualmente.");
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

  return <section>
    <p className="eyebrow">COMPRAS · PROVEEDORES</p>
    <h1>Pedidos.</h1>
    <p className="lead">Prepará la lista, compartila con el proveedor y confirmá el envío. Cada recepción suma al stock lo que efectivamente llegó.</p>
    {!cloudMode && <p className="sync-banner">Conectá tu cocina para administrar pedidos compartidos.</p>}
    {cloudMode && !online && <p className="sync-banner">Pedidos guardados para consulta. El envío y la recepción requieren conexión.</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {info && <p className="sync-banner" role="status">{info}</p>}
    {canEdit && cloudMode && <div className="two-column order-forms">
      <div className="panel">
        <h2>Nuevo proveedor</h2>
        <form onSubmit={saveSupplier}>
          <label className="field">Nombre<input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} maxLength={200} required /></label>
          <label className="field">Contacto o canal<input value={supplierContact} onChange={(event) => setSupplierContact(event.target.value)} maxLength={500} placeholder="WhatsApp, teléfono o email" /></label>
          <button className="secondary" disabled={busy || !online}>Guardar proveedor</button>
        </form>
      </div>
      <div className="panel">
        <h2>Preparar pedido</h2>
        <form onSubmit={saveOrder}>
          <label className="field">Proveedor<select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} required>
            <option value="">Seleccionar proveedor</option>{suppliers.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}
          </select></label>
          {lines.map((line, index) => <div className="order-line-form" key={line.id}>
            <span className="eyebrow">PRODUCTO {index + 1}</span>
            <label className="field">Ingrediente<select value={line.ingredientId} onChange={(event) => setLines(lines.map((item) => item.id === line.id ? { ...item, ingredientId: event.target.value } : item))} required>
              <option value="">Seleccionar ingrediente</option>{ingredients.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.baseUnit}</option>)}
            </select></label>
            <div className="stock-form-row">
              <label className="field">Cantidad{line.ingredientId ? ` (${ingredients.find((item) => item.id === line.ingredientId)?.baseUnit})` : ""}<input inputMode="decimal" value={line.quantity} onChange={(event) => setLines(lines.map((item) => item.id === line.id ? { ...item, quantity: event.target.value } : item))} required /></label>
              <label className="field">Detalle<input value={line.note} onChange={(event) => setLines(lines.map((item) => item.id === line.id ? { ...item, note: event.target.value } : item))} placeholder="Presentación, calidad…" /></label>
            </div>
            {lines.length > 1 && <button className="text-button" type="button" onClick={() => setLines(lines.filter((item) => item.id !== line.id))}>Quitar producto</button>}
          </div>)}
          <button className="text-button" type="button" onClick={() => setLines([...lines, { id: crypto.randomUUID(), ingredientId: "", quantity: "", note: "" }])}>+ Agregar producto</button>
          <label className="field">Nota general<textarea value={draftNote} onChange={(event) => setDraftNote(event.target.value)} /></label>
          <button className="primary" disabled={busy || !online || !suppliers.length || !ingredients.length}>Guardar borrador</button>
        </form>
      </div>
    </div>}
    <h2>Pedidos de la cocina</h2>
    {orders.length ? <div className="order-list">{orders.map((order) => <article className="panel order-card" key={order.id}>
      <div className="row spread"><div><span className="eyebrow">{statusText[order.status]} · {new Date(order.createdAt).toLocaleDateString("es-UY")}</span><h2 className="dish">{order.supplierName}</h2></div><span className="tag">{order.lines.length} productos</span></div>
      {order.supplierContact && <p className="muted">Contacto: {order.supplierContact}</p>}
      {order.lines.map((line) => <div className="line-item" key={line.id}><span>{line.ingredientName}{line.note && <><br /><small>{line.note}</small></>}</span><strong>{formatMilli(line.quantityMilli, line.unit)}{line.receivedMilli > 0 && <><br /><small>Recibido: {formatMilli(line.receivedMilli, line.unit)}</small></>}</strong></div>)}
      {order.note && <p className="muted">{order.note}</p>}
      {order.status === "draft" && canEdit && <>
        <div className="row order-actions"><button className="secondary" disabled={!online} onClick={() => void share(order)}>Compartir pedido</button><button className="primary" disabled={busy || !online} onClick={() => void run(() => onStatus(order.id, "sent"), "Pedido marcado como enviado")}>Confirmar envío</button></div>
        <details className="order-copy"><summary>Ver texto para copiar</summary><textarea readOnly value={orderText(order)} aria-label={`Texto del pedido a ${order.supplierName}`} /></details>
      </>}
      {order.status === "sent" && canEdit && <div className="row order-actions"><button className="secondary" disabled={busy || !online} onClick={() => void run(() => onStatus(order.id, "confirmed"), "Pedido confirmado")}>Marcar confirmado</button></div>}
      {(order.status === "sent" || order.status === "confirmed") && canEdit && <>
        <button className="text-button" disabled={!online} onClick={() => { setReceiptOrderId(receiptOrderId === order.id ? "" : order.id); setReceiptAmounts({}); setReceiptOperationId(crypto.randomUUID()); }}>Registrar recepción →</button>
        {receiptOrderId === order.id && <form className="order-receipt" onSubmit={(event) => void receive(event, order)}>
          <p className="muted">Anotá solo lo que llegó en esta entrega. Dejá vacío lo que no llegó.</p>
          {order.lines.filter((line) => line.receivedMilli < line.quantityMilli).map((line) => <label className="field" key={line.id}>{line.ingredientName} · pendiente {formatMilli(line.quantityMilli - line.receivedMilli, line.unit)}<input inputMode="decimal" value={receiptAmounts[line.id] ?? ""} onChange={(event) => setReceiptAmounts({ ...receiptAmounts, [line.id]: event.target.value })} placeholder="Cantidad recibida" /></label>)}
          <button className="primary" disabled={busy || !online}>Guardar recepción</button>
        </form>}
      </>}
      {canEdit && ["draft", "sent", "confirmed"].includes(order.status) && <button className="text-button order-cancel" disabled={busy || !online} onClick={() => void run(() => onStatus(order.id, "cancelled"), "Pedido cancelado")}>Cancelar pedido</button>}
    </article>)}</div> : <div className="empty"><h2>Aún no hay pedidos.</h2><p>Agregá un proveedor y prepará la primera lista de requerimientos.</p></div>}
  </section>;
}

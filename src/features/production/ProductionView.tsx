import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, Minus, Plus } from "lucide-react";
import { compatibleStockUnit, formatMilli, formatStock, parseMilli, scaleRecipe, toStockMilli, type RecipeVersion, type ScaledIngredient } from "../../../shared/kitchen";
import type { CatalogIngredient, Requirements } from "../../data/repository";
import type { LocalEvent, LocalProduction, LocalRecipe } from "../../local-db";
import { Back, Button, ErrorNote, PageHead, Tag, Toast } from "../../components/ui";
import { isOpen, plannedLabel } from "../home/HomeView";

function milliText(milli: number) { return formatMilli(milli, "g").replace(/ g$/, ""); }

function textMilli(text: string): number | null {
  try { return parseMilli(text); } catch { return null; }
}

/** One row per ingredient: net, gross and what the linked stock item holds, in the approved three-column layout. */
function ProductLines({ version, targetYieldMilli, catalog, incoming }: { version: RecipeVersion; targetYieldMilli: number; catalog: CatalogIngredient[]; incoming: Map<string, number> }) {
  let scaled: ScaledIngredient[] = [];
  try { scaled = scaleRecipe(version, targetYieldMilli); } catch { return <p className="b2-sub">Ingresá una cantidad válida para calcular.</p>; }
  const missing = scaled.filter((ingredient) => {
    const stock = catalog.find((item) => item.id === ingredient.catalogIngredientId);
    return stock && compatibleStockUnit(ingredient.unit, stock.baseUnit) &&
      toStockMilli(ingredient.requiredGrossMilli, ingredient.unit, stock.baseUnit) > stock.availableMilli;
  }).length;
  return <>
    {scaled.map((ingredient) => {
      const stock = catalog.find((item) => item.id === ingredient.catalogIngredientId);
      const linked = stock && compatibleStockUnit(ingredient.unit, stock.baseUnit);
      const needed = linked ? toStockMilli(ingredient.requiredGrossMilli, ingredient.unit, stock.baseUnit) : 0;
      const short = linked ? Math.max(0, needed - stock.availableMilli) : 0;
      return <article className="b2-productline" key={ingredient.id}>
        <div className="b2-row"><h3>{ingredient.name}</h3>{!linked ? <Tag kind="neutral">Sin stock vinculado</Tag>
          : !short ? <Tag>Disponible</Tag>
          : (incoming.get(stock.id) ?? 0) >= short ? <Tag kind="neutral">Pedido en curso</Tag>
          : <Tag kind="warn">Faltan {formatStock(short, stock.baseUnit)}</Tag>}</div>
        <div className="b2-qtygrid">
          <div><span>Neto</span><b>{formatMilli(ingredient.requiredNetMilli, ingredient.unit)}</b></div>
          <div><span>Bruto</span><b>{formatMilli(ingredient.requiredGrossMilli, ingredient.unit)}</b></div>
          <div><span>Disponible</span><b>{linked ? formatStock(stock.availableMilli, stock.baseUnit) : "—"}</b></div>
        </div>
        {ingredient.wastePermille > 0 && <p className="b2-muted" style={{ marginTop: 11 }}>Limpieza: {100 - ingredient.wastePermille / 10} % de rendimiento</p>}
      </article>;
    })}
    {missing > 0 && <p className="b2-sub">{missing === 1 ? "1 ingrediente no alcanza" : `${missing} ingredientes no alcanzan`} con el stock actual.</p>}
  </>;
}

export function ProductionView({ recipes, productions, events, ingredients, requirements, requestedRecipe, focusProductionId, cloudMode, canPlan, onPlan, onRecord, onSaved, onOrders, onRecipes }: {
  recipes: LocalRecipe[];
  productions: LocalProduction[];
  events: LocalEvent[];
  ingredients: CatalogIngredient[];
  requirements: Requirements;
  requestedRecipe: LocalRecipe | null;
  focusProductionId: string;
  cloudMode: boolean;
  canPlan: boolean;
  onPlan: (recipe: LocalRecipe, targetYieldMilli: number, plannedFor: string, eventId?: string) => Promise<void>;
  onRecord: (production: LocalProduction, amountMilli: number) => Promise<void>;
  onSaved: () => void;
  onOrders: () => void;
  onRecipes: () => void;
}) {
  const [view, setView] = useState<"list" | "plan" | "detail">(requestedRecipe ? "plan" : focusProductionId ? "detail" : "list");
  const [selectedRecipeId, setSelectedRecipeId] = useState(requestedRecipe?.id ?? "");
  const [targetText, setTargetText] = useState("");
  const [plannedFor, setPlannedFor] = useState(new Date().toISOString().slice(0, 10));
  const [eventId, setEventId] = useState("");
  const [productionId, setProductionId] = useState(focusProductionId);
  const [tab, setTab] = useState<"Cantidades" | "Registro">("Cantidades");
  const [batchText, setBatchText] = useState("");
  const [confirming, setConfirming] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => { if (requestedRecipe) { setSelectedRecipeId(requestedRecipe.id); setView("plan"); } }, [requestedRecipe]);
  useEffect(() => { if (focusProductionId) { setProductionId(focusProductionId); setView("detail"); setTab("Cantidades"); } }, [focusProductionId]);

  const recipe = recipes.find((item) => item.id === selectedRecipeId) ?? null;
  const production = productions.find((item) => item.id === productionId);
  const target = textMilli(targetText);
  const incoming = new Map(requirements.needs.map((need) => [need.ingredientId, need.incomingMilli]));

  function go(next: typeof view, id = "") {
    setView(next); setError(""); setToast(""); setConfirming(null);
    if (id) { setProductionId(id); setTab("Cantidades"); }
    document.querySelector(".b2-scroll")?.scrollTo({ top: 0 });
  }

  function step(direction: 1 | -1) {
    const current = target ?? 0;
    const next = Math.max(1000, current + direction * 1000);
    setTargetText(milliText(next));
  }

  async function plan(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (!recipe) throw new Error("Elegí una receta");
      const targetYieldMilli = parseMilli(targetText);
      scaleRecipe(recipe.version, targetYieldMilli);
      await onPlan(recipe, targetYieldMilli, plannedFor, eventId || undefined);
      setTargetText(""); setEventId("");
      onSaved();
      go("list");
      setToast("Producción planificada. La versión de la receta queda fija.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo planificar"); }
  }

  function review(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try { setConfirming(parseMilli(batchText)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Cantidad inválida"); }
  }

  async function record() {
    if (!production || confirming === null) return;
    setError("");
    try {
      await onRecord(production, confirming);
      setBatchText(""); setConfirming(null);
      setToast(navigator.onLine || !cloudMode ? "Tanda registrada." : "Tanda guardada en este dispositivo. Se envía al recuperar conexión.");
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo registrar"); }
  }

  if (view === "plan" && canPlan) return <section>
    <Back onClick={() => go("list")}>Cocina de hoy</Back>
    <PageHead eyebrow="COCINA · PLANIFICAR" title={recipe ? <span className="b2-dish" style={{ fontSize: 47 }}>{recipe.version.title}</span> : "Nueva producción."} />
    {recipes.length === 0 ? <div className="b2-empty"><h2>Primero, una receta</h2><p className="b2-sub">Guardá una receta con rendimiento e ingredientes.</p><div className="b2-actions"><Button full onClick={onRecipes}>Abrir recetario</Button></div></div> :
    <form onSubmit={plan}>
      <label className="b2-field">Receta
        <select value={selectedRecipeId} onChange={(event) => setSelectedRecipeId(event.target.value)} required>
          <option value="">Elegí una receta</option>
          {recipes.map((item) => <option key={item.id} value={item.id}>{item.version.title}</option>)}
        </select>
      </label>
      {recipe && <div className="b2-two">
        <div>
          <div className="b2-panel" style={{ marginTop: 0 }}>
            <div className="b2-row"><h2>Cantidad a producir</h2><span className="b2-tag neutral">{recipe.version.yieldUnit}</span></div>
            <div className="b2-counter">
              <button type="button" className="b2-square" onClick={() => step(-1)} aria-label="Restar uno"><Minus /></button>
              <input inputMode="decimal" value={targetText} onChange={(event) => setTargetText(event.target.value)} placeholder={milliText(recipe.version.yieldMilli)} aria-label="Cantidad a producir" required />
              <button type="button" className="b2-square" onClick={() => step(1)} aria-label="Sumar uno"><Plus /></button>
            </div>
            <div className="b2-row"><span className="b2-muted">Base de la receta</span><span style={{ fontSize: 21 }}>{formatMilli(recipe.version.yieldMilli, recipe.version.yieldUnit)}</span></div>
          </div>
          <label className="b2-field">Fecha prevista<input type="date" value={plannedFor} onChange={(event) => setPlannedFor(event.target.value)} /></label>
          <label className="b2-field">Evento
            <select value={eventId} onChange={(event) => setEventId(event.target.value)}>
              <option value="">Producción cotidiana</option>
              {events.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.eventDate}</option>)}
            </select>
          </label>
        </div>
        <div>
          <div className="b2-overline"><h2>Para esta producción</h2><span className="b2-muted">Versión {recipe.version.version}</span></div>
          {target ? <ProductLines version={recipe.version} targetYieldMilli={target} catalog={ingredients} incoming={incoming} /> : <p className="b2-sub">Indicá cuánto producir para ver neto, bruto y stock.</p>}
        </div>
      </div>}
      <ErrorNote>{error}</ErrorNote>
      <div className="b2-actions"><Button full type="submit" disabled={!recipe}>Guardar plan de producción <ArrowRight /></Button></div>
    </form>}
  </section>;

  if (view === "detail" && production) {
    const unit = production.recipe.yieldUnit;
    const done = !isOpen(production);
    return <section>
      <Back onClick={() => go("list")}>Cocina de hoy</Back>
      <div className="b2-row"><Tag kind={done ? "neutral" : ""}>{done ? "Terminada" : production.producedYieldMilli > 0 ? "En producción" : "Planificada"}</Tag><span className="b2-muted">{plannedLabel(production.plannedFor)}</span></div>
      <h1 className="b2-dish" style={{ fontSize: 47, margin: "20px 0" }}>{production.recipe.title}</h1>
      <div className="b2-tabs">{(["Cantidades", "Registro"] as const).map((item) => <button type="button" key={item} aria-pressed={tab === item} onClick={() => { setTab(item); setConfirming(null); }}>{item}</button>)}</div>
      <Toast>{toast}</Toast>
      {tab === "Cantidades" ? <div className="b2-two">
        <div>
          <div className="b2-panel" style={{ marginTop: 0 }}>
            <div className="b2-eyebrow">OBJETIVO</div>
            <div className="b2-big" style={{ marginTop: 20 }}>{milliText(production.producedYieldMilli)}<span>/ {formatMilli(production.targetYieldMilli, unit)}</span></div>
            <div className="b2-track"><span style={{ width: `${Math.min(100, production.producedYieldMilli / production.targetYieldMilli * 100)}%` }} /></div>
            <p className="b2-sub">Versión {production.recipe.version} de la receta, fijada al planificar.</p>
          </div>
        </div>
        <div>
          <div className="b2-overline"><h2>Para esta producción</h2><span className="b2-muted">Versión {production.recipe.version}</span></div>
          {production.recipe.ingredients.length ? <ProductLines version={production.recipe} targetYieldMilli={production.targetYieldMilli} catalog={ingredients} incoming={incoming} /> : <p className="b2-sub">Los ingredientes se muestran al tener acceso a la receta.</p>}
          {canPlan && cloudMode && <div className="b2-actions"><Button full onClick={onOrders}>Comprar faltantes <ArrowRight /></Button></div>}
        </div>
      </div> : <div className="b2-wide-limit">
        <div className="b2-panel">
          <div className="b2-eyebrow">PRODUCIDO HASTA AHORA</div>
          <div className="b2-big" style={{ marginTop: 20 }}>{milliText(production.producedYieldMilli)}<span>/ {formatMilli(production.targetYieldMilli, unit)}</span></div>
          <p className="b2-sub">{unit === "porción" ? "porciones terminadas" : `${unit} terminados`}</p>
        </div>
        {confirming === null ? <form onSubmit={review}>
          <label className="b2-field">Cantidad nueva de esta tanda · {unit}<input inputMode="decimal" value={batchText} onChange={(event) => setBatchText(event.target.value)} required /></label>
          <ErrorNote>{error}</ErrorNote>
          <Button full type="submit">Revisar registro</Button>
        </form> : <div className="b2-panel">
          <h2>Sumar {formatMilli(confirming, unit)}</h2>
          <p className="b2-sub">El total pasará a {formatMilli(production.producedYieldMilli + confirming, unit)}. {cloudMode ? "Descuenta del stock los ingredientes vinculados." : ""} {cloudMode && !navigator.onLine ? "Quedará guardado aquí hasta recuperar conexión." : ""}</p>
          <ErrorNote>{error}</ErrorNote>
          <div className="b2-actions"><Button full onClick={() => void record()}>Confirmar registro</Button><Button quiet onClick={() => setConfirming(null)}>Cancelar</Button></div>
        </div>}
        {production.entries.length > 0 && <>
          <div className="b2-overline" style={{ marginTop: 28 }}><h2>Tandas registradas</h2></div>
          {[...production.entries].reverse().map((entry) => <div className="b2-ingredient" key={entry.id}><span>{new Date(entry.at).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}</span><b>+ {formatMilli(entry.amountMilli, unit)}</b></div>)}
        </>}
      </div>}
      <p className="b2-footnote">{cloudMode ? "Sin conexión, la tanda queda en el dispositivo y se envía una sola vez al volver la red." : "Registros locales de este dispositivo."}</p>
    </section>;
  }

  const open = productions.filter(isOpen).sort((a, b) => (a.plannedFor || "9999").localeCompare(b.plannedFor || "9999"));
  const finished = productions.filter((item) => !isOpen(item));
  return <section>
    <PageHead eyebrow="COCINA · PRODUCCIÓN" title="Cocina de hoy." sub={open.length ? `${open.length} ${open.length === 1 ? "preparación abierta" : "preparaciones abiertas"}.` : undefined} />
    <Toast>{toast}</Toast>
    {open.length ? open.map((item) => <button type="button" className="b2-list-button" key={item.id} onClick={() => go("detail", item.id)}>
      <span><span className="b2-dish">{item.recipe.title}</span><small className="b2-muted" style={{ display: "block", marginTop: 6 }}>{formatMilli(item.producedYieldMilli, item.recipe.yieldUnit)} de {formatMilli(item.targetYieldMilli, item.recipe.yieldUnit)} · {plannedLabel(item.plannedFor)}</small></span>
      <ArrowUpRight />
    </button>) : <div className="b2-empty"><h2>Nada en cocina</h2><p className="b2-sub">{canPlan ? "Planificá una producción desde una receta." : "Todavía no hay producciones compartidas con vos."}</p></div>}
    {canPlan && <div className="b2-actions"><Button full onClick={() => { setSelectedRecipeId(""); go("plan"); }}><Plus /> Planificar producción</Button></div>}
    {finished.length > 0 && <details className="b2-panel"><summary>Terminadas · {finished.length}</summary>
      {finished.map((item) => <button type="button" className="b2-list-button" key={item.id} onClick={() => go("detail", item.id)}>
        <span>{item.recipe.title}<small className="b2-muted" style={{ display: "block", marginTop: 4 }}>{formatMilli(item.producedYieldMilli, item.recipe.yieldUnit)} · {plannedLabel(item.plannedFor)}</small></span><ArrowUpRight />
      </button>)}
    </details>}
  </section>;
}

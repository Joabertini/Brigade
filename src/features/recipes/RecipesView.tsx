import { useEffect, useState } from "react";
import { ArrowUpRight, Download, LockKeyhole, Plus, ScanLine, Search, Users } from "lucide-react";
import { compatibleStockUnit, formatMilli, parseMilli, type IngredientAmount, type RecipeStep, type RecipeVersion, type Unit } from "../../../shared/kitchen";
import type { CatalogIngredient } from "../../data/repository";
import type { LocalRecipe } from "../../local-db";
import { Back, Button, ErrorNote, PageHead, Tag } from "../../components/ui";
import type { RecipeDraft } from "../../../shared/capture";
import { CaptureView, type RecipePrefill } from "./CaptureView";

const units: Unit[] = ["g", "kg", "ml", "L", "un", "atado", "paq", "bandeja", "porción"];
const newId = () => crypto.randomUUID();
type Filter = "Todas" | "Compartidas" | "Privadas";
type Member = { id: string; name: string; email?: string; role: string };

export function RecipesView({ recipes, ingredients: catalog, cloudMode, online, canPlan, canLink, currentUserId, intent, onInterpret, onCreate, onSaved, onPlan, onMembers, onShare, onVisibility, onLink }: {
  recipes: LocalRecipe[];
  ingredients: CatalogIngredient[];
  cloudMode: boolean;
  online: boolean;
  canPlan: boolean;
  canLink: boolean;
  currentUserId?: string;
  intent: "" | "new" | "capture";
  onInterpret: (text: string) => Promise<RecipeDraft>;
  onCreate: (version: RecipeVersion) => Promise<void>;
  onSaved: () => void;
  onPlan: (recipe: LocalRecipe) => void;
  onMembers: () => Promise<Member[]>;
  onShare: (recipeId: string, userId: string) => Promise<void>;
  onVisibility: (recipeId: string, visibility: "private" | "kitchen") => Promise<void>;
  onLink: (recipeId: string, ingredientId: string, catalogIngredientId: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(intent === "new");
  const [capturing, setCapturing] = useState(intent === "capture");
  const [captured, setCaptured] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("Todas");
  const [tab, setTab] = useState<"Ingredientes" | "Pasos" | "Compartir">("Ingredientes");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [yieldText, setYieldText] = useState("");
  const [yieldUnit, setYieldUnit] = useState<Unit>("porción");
  const [rows, setRows] = useState([{ name: "", amount: "", unit: "g" as Unit, waste: "", catalogId: "" }]);
  const [steps, setSteps] = useState<{ title: string; instruction: string; suggested?: boolean }[]>([{ title: "", instruction: "" }]);
  const [error, setError] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [shareMemberId, setShareMemberId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (intent) { setSelectedId(""); setEditing(intent === "new"); setCapturing(intent === "capture"); } }, [intent]);

  function review(prefill: RecipePrefill) {
    setTitle(prefill.title); setDescription(prefill.description);
    setYieldText(prefill.yieldText); setYieldUnit(prefill.yieldUnit);
    setRows(prefill.rows.length ? prefill.rows : [{ name: "", amount: "", unit: "g", waste: "", catalogId: "" }]);
    setSteps(prefill.steps);
    setCaptured(true); setConfirmed(false); setCapturing(false); setEditing(true); setError("");
    document.querySelector(".b2-scroll")?.scrollTo({ top: 0 });
  }

  function closeForm() {
    setEditing(false); setCaptured(false); setConfirmed(false);
  }
  const selected = recipes.find((recipe) => recipe.id === selectedId) ?? null;
  const owned = (recipe: LocalRecipe) => !cloudMode || recipe.ownerUserId === currentUserId;
  const kind = (recipe: LocalRecipe): Filter => recipe.visibility === "kitchen" || !owned(recipe) ? "Compartidas" : "Privadas";
  const label = (recipe: LocalRecipe) => recipe.visibility === "kitchen" ? "Equipo" : owned(recipe) ? "Tuya · privada" : "Compartida con vos";

  function open(recipe: LocalRecipe) {
    setSelectedId(recipe.id); setTab("Ingredientes"); setMessage("");
    document.querySelector(".b2-scroll")?.scrollTo({ top: 0 });
  }

  async function openSharing() {
    setTab("Compartir"); setMessage("");
    try { setMembers(await onMembers()); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "No se pudo abrir el equipo"); }
  }

  async function act(action: () => Promise<void>, success: string) {
    setBusy(true); setMessage("");
    try { await action(); setMessage(success); onSaved(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "No se pudo completar"); }
    finally { setBusy(false); }
  }

  async function saveRecipe(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (!title.trim()) throw new Error("Escribí el nombre de la receta");
      const yieldMilli = parseMilli(yieldText);
      const ingredientRows: IngredientAmount[] = rows.map((row) => {
        if (!row.name.trim()) throw new Error("Completá el nombre de cada ingrediente");
        const waste = row.waste.trim() ? Number(row.waste.replace(",", ".")) : 0;
        if (!Number.isFinite(waste) || waste < 0 || waste >= 100 || Math.round(waste * 10) !== waste * 10) {
          throw new Error("La merma debe estar entre 0 y 99,9 %");
        }
        return {
          id: newId(), name: row.name.trim(), netMilli: parseMilli(row.amount), unit: row.unit,
          wastePermille: Math.round(waste * 10), catalogIngredientId: row.catalogId || null,
        };
      });
      const stepRows: RecipeStep[] = steps.filter((step) => step.title.trim() || step.instruction.trim()).map((step) => ({
        id: newId(), title: step.title.trim() || "Paso", instruction: step.instruction.trim(), ingredientIds: [],
      }));
      if (stepRows.length === 0 && !captured) throw new Error("Agregá al menos un paso");
      if (captured && !confirmed) throw new Error("Confirmá que revisaste cantidades y procedimiento");
      const id = newId();
      await onCreate({
        id: newId(), recipeId: id, version: 1, title: title.trim(), description: description.trim(),
        yieldMilli, yieldUnit, ingredients: ingredientRows, steps: stepRows, confirmedByChef: true,
      });
      closeForm();
      setTitle(""); setDescription(""); setYieldText("");
      setRows([{ name: "", amount: "", unit: "g", waste: "", catalogId: "" }]);
      setSteps([{ title: "", instruction: "" }]);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la receta");
    }
  }

  if (selected) {
    const version = selected.version;
    const canShare = cloudMode && owned(selected);
    return <section>
      <Back onClick={() => setSelectedId("")}>Recetario</Back>
      <div className="b2-row"><Tag>{selected.visibility === "kitchen" ? "Compartida con cocina" : label(selected)}</Tag><span className="b2-muted">Versión {version.version}</span></div>
      <h1 className="b2-dish" style={{ fontSize: 49, margin: "22px 0" }}>{version.title}</h1>
      {version.description && <p className="b2-sub" style={{ whiteSpace: "pre-line" }}>{version.description}</p>}
      <div className="b2-facts">
        <div><b>{formatMilli(version.yieldMilli, version.yieldUnit)}</b><span>Rendimiento</span></div>
        <div><b>{version.ingredients.length}</b><span>Ingredientes</span></div>
        <div><b>{version.steps.length}</b><span>Pasos</span></div>
      </div>
      <div className="b2-tabs">
        {(["Ingredientes", "Pasos"] as const).map((item) => <button type="button" key={item} aria-pressed={tab === item} onClick={() => setTab(item)}>{item}</button>)}
        {canShare && <button type="button" aria-pressed={tab === "Compartir"} onClick={() => void openSharing()}>Compartir</button>}
      </div>
      {tab === "Ingredientes" && <>
        {version.ingredients.map((ingredient) => {
          const linked = catalog.find((item) => item.id === ingredient.catalogIngredientId);
          const options = catalog.filter((item) => compatibleStockUnit(ingredient.unit, item.baseUnit));
          return <div className="b2-ingredient" key={ingredient.id}>
            <span>{ingredient.name}
              {ingredient.wastePermille > 0 && <small>Limpieza: {100 - ingredient.wastePermille / 10} % de rendimiento</small>}
              {cloudMode && !canLink && linked && <small>Stock: {linked.name}</small>}
              {canLink && <select className="b2-select-inline" aria-label={`Ingrediente de stock para ${ingredient.name}`} value={ingredient.catalogIngredientId ?? ""} disabled={busy}
                onChange={(event) => void act(() => onLink(selected.id, ingredient.id, event.target.value || null), "Vínculo con stock guardado.")}>
                <option value="">{options.length ? "Sin vincular a stock" : "Sin ingrediente de stock compatible"}</option>
                {options.map((item) => <option key={item.id} value={item.id}>Stock: {item.name} · {item.baseUnit}</option>)}
              </select>}
            </span>
            <b>{formatMilli(ingredient.netMilli, ingredient.unit)}</b>
          </div>;
        })}
        <p className="b2-sub">Cantidades netas.{canLink ? " Vinculá cada ingrediente con su stock para calcular faltantes y pedidos." : ""}</p>
      </>}
      {tab === "Pasos" && version.steps.map((step, index) => <div className="b2-step" key={step.id}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{step.title}</strong>{step.instruction && <p>{step.instruction}</p>}</div></div>)}
      {tab === "Compartir" && canShare && <div className="b2-panel">
        <h2>Acceso de lectura</h2>
        <p className="b2-sub">El autor conserva la propiedad de la receta.</p>
        <label className="b2-check"><input type="checkbox" checked={selected.visibility === "kitchen"} disabled={busy}
          onChange={() => void act(() => onVisibility(selected.id, selected.visibility === "kitchen" ? "private" : "kitchen"),
            selected.visibility === "kitchen" ? "Ya no está disponible para todo el equipo." : "Disponible para todo el equipo.")} />Compartir con todo el equipo</label>
        <label className="b2-field">O con una persona
          <select value={shareMemberId} onChange={(event) => setShareMemberId(event.target.value)}>
            <option value="">Elegí un integrante</option>
            {members.filter((member) => member.id !== currentUserId).map((member) => <option key={member.id} value={member.id}>{member.name} · {member.email ?? member.role}</option>)}
          </select>
        </label>
        <Button full disabled={!shareMemberId || busy} onClick={() => void act(() => onShare(selected.id, shareMemberId), "Receta compartida con esta persona.")}>Dar acceso</Button>
      </div>}
      {message && <div className="b2-toast" role="status" style={{ marginTop: 18 }}>{message}</div>}
      <div className="b2-actions">{canPlan
        ? <Button full onClick={() => onPlan(selected)}>Planificar producción <ArrowUpRight /></Button>
        : <Button full onClick={() => setSelectedId("")}>Volver al recetario</Button>}</div>
      <p className="b2-footnote"><Download style={{ width: 13, height: 13, verticalAlign: -2 }} /> Disponible en este dispositivo</p>
    </section>;
  }

  if (capturing) return <CaptureView online={online} cloudMode={cloudMode} onInterpret={onInterpret} onReview={review} onCancel={() => setCapturing(false)} />;

  if (editing) return <section>
    <Back onClick={closeForm}>Recetario</Back>
    {captured
      ? <PageHead eyebrow="CAPTURA · ÚLTIMA REVISIÓN" title={<>Revisá<br />y guardá.</>} sub="Todo es editable. Lo que propuso Brigade está marcado como sugerido." />
      : <PageHead eyebrow="RECETA NUEVA" title={<>Tu manera<br />de hacerlo.</>} sub={cloudMode ? "Se guarda privada hasta que decidas compartirla." : "Se guarda en este dispositivo."} />}
    <form onSubmit={saveRecipe}>
      <label className="b2-field">Nombre de la preparación<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Por ejemplo: salsa de tomate" required /></label>
      <div className="b2-formrow">
        <label className="b2-field">Rendimiento<input inputMode="decimal" value={yieldText} onChange={(event) => setYieldText(event.target.value)} placeholder="20" required /></label>
        <label className="b2-field">Unidad<select value={yieldUnit} onChange={(event) => setYieldUnit(event.target.value as Unit)}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
      </div>
      <label className="b2-field">Descripción o nota<textarea value={description} onChange={(event) => setDescription(event.target.value)} style={{ minHeight: 90 }} /></label>
      <div className="b2-overline" style={{ marginTop: 28 }}><h2>Ingredientes</h2><span className="b2-muted">Cantidades netas</span></div>
      {rows.map((row, index) => {
        const update = (patch: Partial<typeof row>) => setRows(rows.map((item, i) => i === index ? { ...item, ...patch } : item));
        const options = catalog.filter((item) => compatibleStockUnit(row.unit, item.baseUnit));
        return <div className="b2-subform" key={index}>
          <label className="b2-field">Ingrediente {index + 1}<input value={row.name} onChange={(event) => update({ name: event.target.value })} required /></label>
          <div className="b2-formrow">
            <label className="b2-field">Cantidad<input inputMode="decimal" value={row.amount} onChange={(event) => update({ amount: event.target.value })} required /></label>
            <label className="b2-field">Unidad<select value={row.unit} onChange={(event) => update({ unit: event.target.value as Unit, catalogId: "" })}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
            <label className="b2-field">Merma %<input inputMode="decimal" value={row.waste} onChange={(event) => update({ waste: event.target.value })} placeholder="0" /></label>
          </div>
          {cloudMode && catalog.length > 0 && <label className="b2-field">Stock<select value={row.catalogId} onChange={(event) => update({ catalogId: event.target.value })}>
            <option value="">{options.length ? "Vincular por nombre al guardar" : "Sin ingrediente de stock compatible"}</option>
            {options.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.baseUnit}</option>)}
          </select></label>}
          {rows.length > 1 && <button type="button" className="b2-link" onClick={() => setRows(rows.filter((_, i) => i !== index))}>Quitar ingrediente</button>}
        </div>;
      })}
      <button type="button" className="b2-link" onClick={() => setRows([...rows, { name: "", amount: "", unit: "g", waste: "", catalogId: "" }])}><Plus /> Agregar ingrediente</button>
      <div className="b2-overline" style={{ marginTop: 28 }}><h2>Procedimiento</h2></div>
      {captured && steps.length === 0 && <p className="b2-sub">Sin procedimiento por ahora. Podés agregarlo abajo.</p>}
      {steps.map((step, index) => <div className="b2-subform" key={index}>
        {step.suggested && <div style={{ marginTop: 12 }}><Tag kind="neutral">Sugerido por Brigade · revisar</Tag></div>}
        <label className="b2-field">Paso {index + 1}<input value={step.title} onChange={(event) => setSteps(steps.map((row, i) => i === index ? { ...row, title: event.target.value, suggested: false } : row))} placeholder="Preparar" /></label>
        <label className="b2-field">Instrucción<textarea value={step.instruction} onChange={(event) => setSteps(steps.map((row, i) => i === index ? { ...row, instruction: event.target.value, suggested: false } : row))} style={{ minHeight: 90 }} /></label>
      </div>)}
      <button type="button" className="b2-link" onClick={() => setSteps([...steps, { title: "", instruction: "" }])}><Plus /> Agregar paso</button>
      {captured && <label className="b2-check"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />Revisé cantidades y procedimiento.</label>}
      <ErrorNote>{error}</ErrorNote>
      <div className="b2-actions"><Button full type="submit" disabled={captured && !confirmed}>{cloudMode ? "Guardar receta privada" : "Guardar en este dispositivo"}</Button></div>
    </form>
  </section>;

  const query = search.toLocaleLowerCase();
  const shown = recipes.filter((recipe) => recipe.version.title.toLocaleLowerCase().includes(query) && (filter === "Todas" || kind(recipe) === filter));
  return <section>
    <div className="b2-inline-head"><PageHead eyebrow="RECETARIO" title="Tu recetario." /><Button onClick={() => setCapturing(true)}><ScanLine /> Capturar receta</Button></div>
    <div className="b2-searchbox"><Search /><input className="b2-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar una preparación" aria-label="Buscar una preparación" /></div>
    <div className="b2-tabs">{(["Todas", "Compartidas", "Privadas"] as const).map((item) => <button type="button" key={item} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}</div>
    {shown.length ? <div className="b2-recipe-grid">{shown.map((recipe, index) => <button type="button" className="b2-recipe-cell" key={recipe.id} onClick={() => open(recipe)}>
      <div className="b2-row"><span className="b2-recipe-index">RECETA / {String(index + 1).padStart(2, "0")}</span><span className="b2-tag neutral">{kind(recipe) === "Privadas" ? <LockKeyhole /> : <Users />}{label(recipe)}</span></div>
      <h2 className="b2-dish">{recipe.version.title}</h2>
      <div className="b2-cellfoot"><span>{formatMilli(recipe.version.yieldMilli, recipe.version.yieldUnit)} · Versión {recipe.version.version}</span><ArrowUpRight /></div>
    </button>)}</div> : <div className="b2-empty">
      <h2>{recipes.length ? "No encontramos esa receta" : "Empezá por una receta"}</h2>
      <p className="b2-sub">{recipes.length ? "Probá otro nombre." : cloudMode ? "Las recetas consultadas quedan disponibles sin conexión." : "Queda en este dispositivo, incluso sin conexión."}</p>
    </div>}
    <div className="b2-actions"><Button full onClick={() => setEditing(true)}><Plus /> Escribir una receta</Button></div>
  </section>;
}

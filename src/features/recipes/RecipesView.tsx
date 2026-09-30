import { useState } from "react";
import { formatMilli, parseMilli, type IngredientAmount, type RecipeStep, type RecipeVersion, type Unit } from "../../../shared/kitchen";
import type { LocalRecipe } from "../../local-db";

const units: Unit[] = ["g", "kg", "ml", "L", "un", "atado", "paq", "bandeja", "porción"];
const newId = () => crypto.randomUUID();

export function RecipesView({ recipes, cloudMode, canPlan, currentUserId, onCreate, onSaved, onPlan, onMembers, onShare, onVisibility }: {
  recipes: LocalRecipe[];
  cloudMode: boolean;
  canPlan: boolean;
  currentUserId?: string;
  onCreate: (version: RecipeVersion) => Promise<void>;
  onSaved: () => void;
  onPlan: (recipe: LocalRecipe) => void;
  onMembers: () => Promise<{ id: string; name: string; email?: string; role: string }[]>;
  onShare: (recipeId: string, userId: string) => Promise<void>;
  onVisibility: (recipeId: string, visibility: "private" | "kitchen") => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<LocalRecipe | null>(null);
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [yieldText, setYieldText] = useState("");
  const [yieldUnit, setYieldUnit] = useState<Unit>("porción");
  const [ingredients, setIngredients] = useState([{ name: "", amount: "", unit: "g" as Unit, waste: "" }]);
  const [steps, setSteps] = useState([{ title: "", instruction: "" }]);
  const [error, setError] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [members, setMembers] = useState<{ id: string; name: string; email?: string; role: string }[]>([]);
  const [shareMemberId, setShareMemberId] = useState("");
  const [shareMessage, setShareMessage] = useState("");

  async function openSharing() {
    setShareMessage("");
    try { setMembers(await onMembers()); setShareOpen(true); }
    catch (cause) { setShareMessage(cause instanceof Error ? cause.message : "No se pudo abrir el equipo"); }
  }

  async function shareWithMember() {
    if (!selected || !shareMemberId) return;
    try {
      await onShare(selected.id, shareMemberId);
      setShareMessage("Receta compartida con esta persona.");
    } catch (cause) { setShareMessage(cause instanceof Error ? cause.message : "No se pudo compartir"); }
  }

  async function toggleTeamVisibility() {
    if (!selected) return;
    const next = selected.visibility === "kitchen" ? "private" : "kitchen";
    try {
      await onVisibility(selected.id, next);
      setSelected({ ...selected, visibility: next });
      setShareMessage(next === "kitchen" ? "Disponible para todo el equipo." : "Ya no está disponible para todo el equipo.");
      onSaved();
    } catch (cause) { setShareMessage(cause instanceof Error ? cause.message : "No se pudo cambiar el acceso"); }
  }

  function addIngredient() {
    setIngredients([...ingredients, { name: "", amount: "", unit: "g", waste: "" }]);
  }

  function addStep() {
    setSteps([...steps, { title: "", instruction: "" }]);
  }

  async function saveRecipe(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (!title.trim()) throw new Error("Escribí el nombre de la receta");
      const yieldMilli = parseMilli(yieldText);
      const ingredientRows: IngredientAmount[] = ingredients.map((ingredient) => {
        if (!ingredient.name.trim()) throw new Error("Completá el nombre de cada ingrediente");
        const waste = ingredient.waste.trim() ? Number(ingredient.waste.replace(",", ".")) : 0;
        if (!Number.isFinite(waste) || waste < 0 || waste >= 100 || Math.round(waste * 10) !== waste * 10) {
          throw new Error("La merma debe estar entre 0 y 99,9 %");
        }
        return {
          id: newId(), name: ingredient.name.trim(), netMilli: parseMilli(ingredient.amount),
          unit: ingredient.unit, wastePermille: Math.round(waste * 10),
        };
      });
      const stepRows: RecipeStep[] = steps.filter((step) => step.title.trim() || step.instruction.trim()).map((step) => ({
        id: newId(), title: step.title.trim() || "Paso", instruction: step.instruction.trim(), ingredientIds: [],
      }));
      if (stepRows.length === 0) throw new Error("Agregá al menos un paso");
      const id = newId();
      const version: RecipeVersion = {
        id: newId(), recipeId: id, version: 1, title: title.trim(), description: description.trim(),
        yieldMilli, yieldUnit, ingredients: ingredientRows, steps: stepRows, confirmedByChef: true,
      };
      await onCreate(version);
      setEditing(false);
      setTitle(""); setDescription(""); setYieldText("");
      setIngredients([{ name: "", amount: "", unit: "g", waste: "" }]);
      setSteps([{ title: "", instruction: "" }]);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la receta");
    }
  }

  if (selected) {
    const version = selected.version;
    return (
      <section>
        <button className="text-button" onClick={() => setSelected(null)}>← Recetario</button>
        <div className="row spread"><span className="tag">{selected.visibility === "kitchen" ? "Compartida con cocina" : selected.ownerUserId !== currentUserId && cloudMode ? "Compartida conmigo" : "Privada"}</span><span className="muted">Versión {version.version}</span></div>
        <h1 className="dish detail-title">{version.title}</h1>
        <p className="muted">{version.description}</p>
        <div className="facts"><div><strong>{formatMilli(version.yieldMilli, version.yieldUnit)}</strong><span>Rendimiento base</span></div><div><strong>{version.ingredients.length}</strong><span>Ingredientes</span></div></div>
        <div className="two-column">
          <div><h2>Ingredientes netos</h2>{version.ingredients.map((ingredient) => <div className="line-item" key={ingredient.id}><span>{ingredient.name}{ingredient.wastePermille ? <small> · merma {ingredient.wastePermille / 10} %</small> : null}</span><strong>{formatMilli(ingredient.netMilli, ingredient.unit)}</strong></div>)}</div>
          <div><h2>Procedimiento</h2>{version.steps.map((step, index) => <div className="step" key={step.id}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{step.title}</strong><p>{step.instruction}</p></div></div>)}</div>
        </div>
        {cloudMode && selected.ownerUserId === currentUserId && <>
          <button className="secondary share-toggle" onClick={() => void openSharing()}>Compartir receta</button>
          {!shareOpen && shareMessage && <p className="muted" role="status">{shareMessage}</p>}
          {shareOpen && <div className="panel share-panel">
            <h2>Acceso a la receta</h2>
            <p className="muted">Conservás la propiedad. Podés compartirla con todo el equipo o con una persona.</p>
            <button className="secondary" onClick={() => void toggleTeamVisibility()}>
              {selected.visibility === "kitchen" ? "Quitar acceso del equipo" : "Compartir con todo el equipo"}
            </button>
            <div className="form-row share-row">
              <label className="field">Persona
                <select value={shareMemberId} onChange={(event) => setShareMemberId(event.target.value)}>
                  <option value="">Elegí un integrante</option>
                  {members.filter((member) => member.id !== currentUserId).map((member) => <option key={member.id} value={member.id}>{member.name} · {member.email ?? member.role}</option>)}
                </select>
              </label>
              <button className="secondary" onClick={() => void shareWithMember()} disabled={!shareMemberId}>Dar acceso</button>
            </div>
            {shareMessage && <p className="muted" role="status">{shareMessage}</p>}
          </div>}
        </>}
        {canPlan && <button className="primary" onClick={() => onPlan(selected)}>Planificar producción →</button>}
      </section>
    );
  }

  if (editing) return (
    <section>
      <button className="text-button" onClick={() => setEditing(false)}>← Recetario</button>
      <p className="eyebrow">NUEVA RECETA · INGRESO MANUAL</p>
      <h1>De tu cocina<br />a Brigade.</h1>
      <form onSubmit={saveRecipe}>
        <label className="field">Nombre<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
        <label className="field">Descripción o nota<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <div className="form-row">
          <label className="field">Rendimiento base<input inputMode="decimal" value={yieldText} onChange={(event) => setYieldText(event.target.value)} placeholder="20" required /></label>
          <label className="field">Unidad<select value={yieldUnit} onChange={(event) => setYieldUnit(event.target.value as Unit)}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
        </div>
        <h2>Ingredientes</h2>
        {ingredients.map((ingredient, index) => <div className="ingredient-form" key={index}>
          <label className="field">Ingrediente<input value={ingredient.name} onChange={(event) => setIngredients(ingredients.map((row, i) => i === index ? { ...row, name: event.target.value } : row))} required /></label>
          <div className="form-row">
            <label className="field">Cantidad neta<input inputMode="decimal" value={ingredient.amount} onChange={(event) => setIngredients(ingredients.map((row, i) => i === index ? { ...row, amount: event.target.value } : row))} required /></label>
            <label className="field">Unidad<select value={ingredient.unit} onChange={(event) => setIngredients(ingredients.map((row, i) => i === index ? { ...row, unit: event.target.value as Unit } : row))}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
            <label className="field">Merma %<input inputMode="decimal" value={ingredient.waste} onChange={(event) => setIngredients(ingredients.map((row, i) => i === index ? { ...row, waste: event.target.value } : row))} placeholder="0" /></label>
          </div>
        </div>)}
        <button type="button" className="text-button" onClick={addIngredient}>+ Agregar ingrediente</button>
        <h2>Pasos</h2>
        {steps.map((step, index) => <div className="ingredient-form" key={index}>
          <label className="field">Paso {index + 1}<input value={step.title} onChange={(event) => setSteps(steps.map((row, i) => i === index ? { ...row, title: event.target.value } : row))} placeholder="Preparar" /></label>
          <label className="field">Instrucción<textarea value={step.instruction} onChange={(event) => setSteps(steps.map((row, i) => i === index ? { ...row, instruction: event.target.value } : row))} /></label>
        </div>)}
        <button type="button" className="text-button" onClick={addStep}>+ Agregar paso</button>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" type="submit">{cloudMode ? "Guardar receta privada" : "Guardar receta en este dispositivo"}</button>
      </form>
    </section>
  );

  const shown = recipes.filter((recipe) => recipe.version.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return (
    <section>
      <div className="row spread"><div><p className="eyebrow">RECETARIO</p><h1>Tu recetario.</h1></div><button className="secondary" onClick={() => setEditing(true)}>+ Nueva</button></div>
      <input className="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar una preparación" aria-label="Buscar una preparación" />
      {shown.length ? <div className="recipe-grid">{shown.map((recipe, index) => <button className="recipe-card" key={recipe.id} onClick={() => setSelected(recipe)}>
        <div className="row spread"><span className="eyebrow">RECETA / {String(index + 1).padStart(2, "0")}</span><span className="tag">{recipe.visibility === "kitchen" ? "Equipo" : recipe.ownerUserId !== currentUserId && cloudMode ? "Compartida conmigo" : "Privada"}</span></div>
        <h2 className="dish">{recipe.version.title}</h2>
        <span className="muted">{formatMilli(recipe.version.yieldMilli, recipe.version.yieldUnit)} · Versión {recipe.version.version} ↗</span>
      </button>)}</div> : <div className="empty"><h2>Empezá por una receta.</h2><p>Quedará disponible en este dispositivo incluso sin conexión.</p><button className="primary" onClick={() => setEditing(true)}>Escribir una receta</button></div>}
      <p className="footnote">{cloudMode ? "Las recetas consultadas quedan disponibles sin conexión. Captura por imagen: en desarrollo." : "Este cuaderno permanece en el dispositivo. Para compartir recetas, conectá tu cocina."}</p>
    </section>
  );
}

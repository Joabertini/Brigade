import { useState } from "react";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { formatMilli, type Unit } from "../../../shared/kitchen";
import { normalizeUnit, type DraftQuestion, type RecipeDraft } from "../../../shared/capture";
import { Back, Button, ErrorNote, PageHead, Tag } from "../../components/ui";

export type RecipePrefill = {
  title: string;
  yieldText: string;
  yieldUnit: Unit;
  rows: { name: string; amount: string; unit: Unit; waste: string; catalogId: string }[];
  steps: { title: string; instruction: string; suggested?: boolean }[];
  description: string;
  source: string;
};

const units: Unit[] = ["g", "kg", "ml", "L", "un", "atado", "paq", "bandeja", "porción"];
const amountText = (milli: number | null) => milli === null ? "" : formatMilli(milli, "g").replace(/ g$/, "");

/** "20 g", "1,5 kg", "2 dientes"… → amount + unit when an option can be applied to an ingredient directly. */
function parseAmountLabel(label: string): { amount: string; unit: Unit } | null {
  const match = /^(\d+(?:[.,]\d{1,3})?)\s*([a-záéíóúñ.]+)/i.exec(label.trim());
  const unit = match && normalizeUnit(match[2]);
  return match && unit ? { amount: match[1].replace(".", ","), unit } : null;
}

type Answer = { choice: string; free: string; amount: string; unit: Unit };

export function CaptureView({ online, cloudMode, onInterpret, onReview, onCancel }: {
  online: boolean;
  cloudMode: boolean;
  onInterpret: (text: string) => Promise<RecipeDraft>;
  onReview: (prefill: RecipePrefill) => void;
  onCancel: () => void;
}) {
  const [source, setSource] = useState("");
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [tab, setTab] = useState<"Revisión" | "Original">("Revisión");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function interpret() {
    setBusy(true); setError("");
    try {
      const result = await onInterpret(source);
      setDraft(result); setStep(0); setAnswers({}); setTab("Revisión");
      if (!result.questions.length) finish(result, {});
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo interpretar"); }
    finally { setBusy(false); }
  }

  function answerFor(question: DraftQuestion, current = answers): Answer {
    const ingredient = question.ingredientIndex !== null ? draft?.ingredients[question.ingredientIndex] : undefined;
    return current[question.id] ?? {
      choice: "", free: "",
      amount: question.topic === "ingredient" ? amountText(ingredient?.amountMilli ?? null) : "",
      unit: question.topic === "yield" ? "un" : ingredient?.unit ?? "g",
    };
  }

  function update(question: DraftQuestion, patch: Partial<Answer>) {
    setAnswers({ ...answers, [question.id]: { ...answerFor(question), ...patch } });
  }

  function answered(question: DraftQuestion): boolean {
    const answer = answerFor(question);
    if (question.topic === "ingredient") return answer.choice === "__cn" || Boolean(answer.amount.trim());
    if (answer.choice === "__other") return question.topic === "yield" ? Boolean(answer.amount.trim()) : Boolean(answer.free.trim());
    return Boolean(answer.choice);
  }

  function finish(result: RecipeDraft, given: Record<string, Answer>) {
    let yieldText = amountText(result.yieldMilli);
    let yieldUnit: Unit = result.yieldUnit ?? "porción";
    const rows = result.ingredients.map((item) => ({ name: item.name, amount: amountText(item.amountMilli), unit: item.unit ?? "g", waste: "", catalogId: "" }));
    let steps: RecipePrefill["steps"] = result.steps.map((item) => ({ ...item }));
    const notes: string[] = [];
    const withoutAmount = new Set<number>();
    for (const question of result.questions) {
      const answer = given[question.id];
      if (!answer) continue;
      const option = question.options.find((item) => item.label === answer.choice);
      if (question.topic === "yield") {
        if (option?.yieldMilli && option.yieldUnit) { yieldText = amountText(option.yieldMilli); yieldUnit = option.yieldUnit; }
        else if (answer.choice === "__other") { yieldText = answer.amount; yieldUnit = answer.unit; }
        else if (option) notes.push(`Rendimiento: ${option.label}`);
      } else if (question.topic === "ingredient" && question.ingredientIndex !== null) {
        if (answer.choice === "__cn") { withoutAmount.add(question.ingredientIndex); notes.push(`${rows[question.ingredientIndex].name}: c/n, sin cantidad fija`); }
        else rows[question.ingredientIndex] = { ...rows[question.ingredientIndex], amount: answer.amount, unit: answer.unit };
      } else if (question.topic === "steps") {
        if (option?.steps === "suggested") steps = result.suggestedSteps.map((item) => ({ ...item, suggested: true }));
        else if (option?.steps === "source") steps = result.steps.map((item) => ({ ...item }));
        else if (option?.steps === "write") steps = [{ title: "", instruction: "" }];
        else steps = [];
      } else {
        const value = answer.choice === "__other" ? answer.free.trim() : answer.choice;
        if (value) notes.push(`${question.question.replace(/[¿?]/g, "").trim()}: ${value}`);
      }
    }
    onReview({
      title: result.title, yieldText, yieldUnit, rows: rows.filter((_, index) => !withoutAmount.has(index)), steps, source,
      description: notes.length ? `Indicaciones del chef al revisar la captura:\n${notes.map((note) => `• ${note}`).join("\n")}` : "",
    });
  }

  if (!draft) return <section className="b2-wide-limit b2-capture">
    <Back onClick={onCancel}>Recetario</Back>
    <PageHead eyebrow="CAPTURA · PEGAR TEXTO" title={<>Tu receta,<br />desde un texto.</>} sub="Pegá un mensaje, una nota o lo que copiaste del cuaderno. Brigade arma la receta y te pregunta lo que no esté claro." />
    {!cloudMode && <div className="b2-offline">Conectá tu cocina para interpretar recetas.</div>}
    {cloudMode && !online && <div className="b2-offline">Sin conexión. La interpretación necesita red; el texto queda acá.</div>}
    <label className="b2-field">Texto de la receta<textarea value={source} onChange={(event) => setSource(event.target.value)} maxLength={8000} placeholder={"Pancitos de 30 g para paneras\n1.250k harina\n40 g azúcar\n…"} style={{ minHeight: 220 }} /></label>
    <ErrorNote>{error}</ErrorNote>
    <Button full disabled={busy || !online || !cloudMode || !source.trim()} onClick={() => void interpret()}>{busy ? "Leyendo la receta…" : <>Interpretar receta <Sparkles /></>}</Button>
    <p className="b2-footnote">Nada se guarda hasta que revises y confirmes.</p>
  </section>;

  const questions = draft.questions;
  const question = questions[step];
  const answer = question ? answerFor(question) : null;
  const ingredient = question?.ingredientIndex !== null && question ? draft.ingredients[question.ingredientIndex] : undefined;
  return <section className="b2-wide-limit b2-capture">
    <Back onClick={() => setDraft(null)}>Editar el texto</Back>
    <div className="b2-pagehead"><div className="b2-eyebrow">CAPTURA · REVISAR RECETA</div><h1 className="b2-dish">{draft.title || "Receta sin nombre"}</h1></div>
    <div className="b2-tabs">{(["Revisión", "Original"] as const).map((item) => <button type="button" key={item} aria-pressed={tab === item} onClick={() => setTab(item)}>{item}</button>)}</div>
    {tab === "Original" ? <>
      <div className="b2-row"><h2>Fuente de la receta</h2></div>
      <div className="b2-source"><span className="b2-muted">Texto pegado</span><p style={{ whiteSpace: "pre-wrap" }}>{source}</p></div>
      <Button full onClick={() => setTab("Revisión")}>Volver a la revisión</Button>
    </> : question && answer && <>
      <div className="b2-row"><span className="b2-eyebrow">{String(step + 1).padStart(2, "0")} / {String(questions.length).padStart(2, "0")} · CONFIRMAR</span><Tag kind="warn">Necesita tu criterio</Tag></div>
      <div className="b2-track" style={{ margin: "15px 0 26px" }}><span style={{ width: `${(step + 1) / questions.length * 100}%` }} /></div>
      {question.source && <div className="b2-callout"><span className="b2-muted">En la fuente dice</span><br /><strong>“{question.source}”</strong></div>}
      <h2 className="b2-question">{question.question}</h2>
      {question.topic === "ingredient" ? <>
        {question.options.map((option) => { const parsed = parseAmountLabel(option.label); return parsed
          ? <label className="b2-choice" key={option.label}><input type="radio" name={question.id} checked={answer.choice === option.label} onChange={() => update(question, { choice: option.label, ...parsed })} />{option.label}</label>
          : null; })}
        <label className="b2-choice"><input type="radio" name={question.id} checked={answer.choice === "__cn"} onChange={() => update(question, { choice: "__cn" })} />Sin cantidad fija (c/n): queda como nota</label>
        {answer.choice !== "__cn" && <div className="b2-formrow">
          <label className="b2-field">Cantidad de {ingredient?.name}<input inputMode="decimal" value={answer.amount} onChange={(event) => update(question, { amount: event.target.value, choice: "" })} /></label>
          <label className="b2-field">Unidad<select value={answer.unit} onChange={(event) => update(question, { unit: event.target.value as Unit })}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
        </div>}
      </> : <>
        {question.options.map((option) => <label className="b2-choice" key={option.label}><input type="radio" name={question.id} checked={answer.choice === option.label} onChange={() => update(question, { choice: option.label })} />{option.label}</label>)}
        {question.topic !== "steps" && <label className="b2-choice"><input type="radio" name={question.id} checked={answer.choice === "__other"} onChange={() => update(question, { choice: "__other" })} />{question.topic === "yield" ? "Otra cantidad" : "Otra indicación"}</label>}
        {answer.choice === "__other" && (question.topic === "yield"
          ? <div className="b2-formrow">
            <label className="b2-field">Rinde<input inputMode="decimal" value={answer.amount} onChange={(event) => update(question, { amount: event.target.value })} /></label>
            <label className="b2-field">Unidad<select value={answer.unit} onChange={(event) => update(question, { unit: event.target.value as Unit })}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
          </div>
          : <label className="b2-field">Tu indicación<textarea value={answer.free} onChange={(event) => update(question, { free: event.target.value })} style={{ minHeight: 90 }} /></label>)}
        {question.topic === "steps" && draft.suggestedSteps.length > 0 && <div className="b2-panel">
          <div className="b2-row"><h2>Procedimiento sugerido</h2><Tag kind="neutral">Propuesta · revisar</Tag></div>
          {draft.suggestedSteps.map((item, index) => <div className="b2-step" key={index}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{item.title}</strong><p>{item.instruction}</p></div></div>)}
        </div>}
      </>}
      <p className="b2-sub">{question.topic === "yield" ? "Sin rendimiento confirmado no se puede escalar la receta." : question.topic === "steps" ? "Lo sugerido no es parte de la fuente: lo vas a poder editar antes de guardar." : "Elegí lo que hacés en tu cocina. Nada se asume."}</p>
      <div className="b2-actions"><Button full disabled={!answered(question)} onClick={() => step + 1 < questions.length ? setStep(step + 1) : finish(draft, answers)}>{step + 1 < questions.length ? "Siguiente" : "Revisar receta"} <ArrowRight /></Button></div>
      {step > 0 && <button type="button" className="b2-link" onClick={() => setStep(step - 1)}><ArrowLeft /> Volver</button>}
    </>}
  </section>;
}

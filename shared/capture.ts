import type { Unit } from "./kitchen";

/** What the model returns before normalization. Everything is optional because model output is untrusted. */
export interface RawDraft {
  title?: unknown;
  yield?: { amount?: unknown; unit?: unknown; source?: unknown } | null;
  ingredients?: { name?: unknown; amount?: unknown; unit?: unknown; source?: unknown }[];
  steps?: { title?: unknown; instruction?: unknown }[];
  suggestedSteps?: { title?: unknown; instruction?: unknown }[];
  questions?: { topic?: unknown; ingredientIndex?: unknown; source?: unknown; question?: unknown; options?: unknown }[];
}

export interface DraftIngredient { name: string; amountMilli: number | null; unit: Unit | null; source: string }
export interface DraftOption { label: string; yieldMilli?: number; yieldUnit?: Unit; steps?: "suggested" | "source" | "write" | "none" }
export interface DraftQuestion { id: string; topic: "yield" | "ingredient" | "steps" | "other"; ingredientIndex: number | null; source: string; question: string; options: DraftOption[] }
export interface RecipeDraft {
  title: string;
  yieldMilli: number | null;
  yieldUnit: Unit | null;
  ingredients: DraftIngredient[];
  steps: { title: string; instruction: string }[];
  /** Procedure proposed by the model when the source has none. Never saved unless the chef accepts it. */
  suggestedSteps: { title: string; instruction: string }[];
  questions: DraftQuestion[];
}

const unitAliases: [RegExp, Unit][] = [
  [/^(kg|kgs|k|kilo|kilos|kilogramos?)$/, "kg"],
  [/^(g|gr|grs|grm|grms|gramos?)$/, "g"],
  [/^(ml|cc|mililitros?)$/, "ml"],
  [/^(l|lt|lts|litros?)$/, "L"],
  [/^(u|un|und|unid|unidad|unidades)$/, "un"],
  [/^(atados?)$/, "atado"],
  [/^(paq|paquetes?)$/, "paq"],
  [/^(bandejas?)$/, "bandeja"],
  [/^(porci[oó]n|porciones|pancitos?|piezas?)$/, "porción"],
];

export function normalizeUnit(value: unknown): Unit | null {
  if (typeof value !== "string") return null;
  const clean = value.trim().toLowerCase().replace(/\.$/, "");
  return unitAliases.find(([pattern]) => pattern.test(clean))?.[1] ?? null;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function milli(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(",", ".")) : NaN;
  if (!Number.isFinite(number) || number <= 0 || number > 1e9) return null;
  return Math.round(number * 1000);
}

/** Total weight of the ingredients in grams (milli), when every ingredient is weighed; otherwise null. */
export function totalMassMilli(ingredients: DraftIngredient[]): number | null {
  if (!ingredients.length) return null;
  let total = 0;
  for (const item of ingredients) {
    if (item.amountMilli === null || (item.unit !== "g" && item.unit !== "kg")) return null;
    total += item.unit === "kg" ? item.amountMilli * 1000 : item.amountMilli;
  }
  return total;
}

/**
 * Turns untrusted model output into a draft the chef reviews. Anything the model left unclear becomes a question;
 * nothing ambiguous is saved silently. Missing yield, amounts or procedure always produce a question here, even if
 * the model forgot to ask.
 */
export function normalizeDraft(raw: RawDraft, sourceText = ""): RecipeDraft {
  const ingredients: DraftIngredient[] = (Array.isArray(raw.ingredients) ? raw.ingredients : []).slice(0, 100).map((item) => ({
    name: text(item?.name, 200),
    amountMilli: milli(item?.amount),
    unit: normalizeUnit(item?.unit),
    source: text(item?.source, 300),
  })).filter((item) => item.name);
  // The model sometimes drops a number it copied into "source" ("albahaca 1 atado"). Recover it only when the
  // source names this ingredient alone and holds exactly one quantity, so "2 kg cebolla y sal" never feeds the salt.
  ingredients.forEach((item) => {
    if (item.amountMilli !== null || !item.source) return;
    const others = ingredients.filter((other) => other !== item).some((other) => item.source.toLowerCase().includes(other.name.toLowerCase()));
    const quantities = [...item.source.matchAll(/(\d+(?:[.,]\d+)?)\s*([a-záéíóúñ]+)/gi)];
    if (others || quantities.length !== 1 || !item.source.toLowerCase().includes(item.name.toLowerCase())) return;
    const unit = normalizeUnit(quantities[0][2]);
    if (!unit || (item.unit && item.unit !== unit)) return;
    item.amountMilli = milli(quantities[0][1]);
    item.unit = unit;
  });
  // "200 g azúcar + 150 p/caramelo": the second amount shares the unit and belongs to the same ingredient.
  ingredients.forEach((item) => {
    if (item.amountMilli === null || item.unit !== null || !item.source) return;
    const lines = sourceText.split(/\r?\n/);
    const line = lines.find((value) => value.includes(item.source)) ?? item.source;
    const sibling = ingredients.find((other) => other !== item && other.unit && other.source && line.includes(other.source));
    if (!sibling) return;
    item.unit = sibling.unit;
    const purpose = /p\/\s*([a-záéíóúñ]+)/i.exec(item.source)?.[1];
    if (purpose && item.name.toLowerCase() === purpose.toLowerCase()) item.name = `${sibling.name} para ${purpose}`;
  });
  const readSteps = (list: RawDraft["steps"]) => (Array.isArray(list) ? list : []).slice(0, 200).map((step, index) => ({
    title: text(step?.title, 200) || `Paso ${index + 1}`,
    instruction: text(step?.instruction, 5000),
  })).filter((step) => step.instruction);
  const steps = readSteps(raw.steps);
  // With a source procedure, a suggestion is only kept when it adds steps (the source was partial).
  const proposed = readSteps(raw.suggestedSteps).slice(0, 20);
  const suggestedSteps = !steps.length || proposed.length > steps.length ? proposed : [];
  let yieldMilli = milli(raw.yield?.amount);
  let yieldUnit = normalizeUnit(raw.yield?.unit);
  if (!yieldMilli || !yieldUnit) { yieldMilli = null; yieldUnit = null; }

  const questions: DraftQuestion[] = [];
  for (const [index, item] of (Array.isArray(raw.questions) ? raw.questions : []).slice(0, 12).entries()) {
    const question = text(item?.question, 300);
    // Preferences (type, brand, whether something "can" be swapped) do not change quantities or technique.
    // Known kitchen shorthand (p/, c/, s/, c/n) is resolved by the prompt, never asked back.
    if (/qu[eé] significa/i.test(question) && /\b[pcs]\/|c\/n/i.test(question)) continue;
    if (!question || /(tipo de|marca|variedad|temperatura|se puede usar|se podr[ií]a usar|preferís|prefiere)/i.test(question)) continue;
    let topic = ["yield", "ingredient", "steps", "other"].includes(item?.topic as string) ? item!.topic as DraftQuestion["topic"] : "other";
    const ingredientIndex = Number.isInteger(item?.ingredientIndex) && (item!.ingredientIndex as number) < ingredients.length ? item!.ingredientIndex as number : null;
    // "ingredient" means the quantity is missing; any other question about an ingredient is an indication.
    const known = ingredientIndex !== null && ingredients[ingredientIndex].amountMilli !== null && ingredients[ingredientIndex].unit !== null;
    // Asking the quantity of something whose quantity the source already gives is noise.
    if (known && /(qu[eé] cantidad|cu[aá]nt[oa]s?)\b/i.test(question)) continue;
    if (topic === "ingredient" && (ingredientIndex === null || known || /momento|cu[aá]ndo|c[oó]mo/i.test(question))) topic = "other";
    const options = (Array.isArray(item?.options) ? item!.options : []).map((option) => text(option, 160)).filter((option) => option && !/^(otr[oa]s?|otra (cantidad|opción|indicación))$/i.test(option)).slice(0, 4).map((label) => ({ label }));
    questions.push({ id: `m${index}`, topic, ingredientIndex, source: text(item?.source, 300), question, options });
  }

  if (!steps.length) {
    // Without a source procedure, "when is X added" is answered by choosing or writing the procedure.
    const timing = /(cu[aá]ndo|en qu[eé] momento)\s+(se\s+)?(agreg|incorpor|añad|pon|usa|echa)/i;
    for (let index = questions.length - 1; index >= 0; index -= 1) if (timing.test(questions[index].question)) questions.splice(index, 1);
  }
  if (!yieldMilli && !questions.some((item) => item.topic === "yield")) {
    questions.unshift({ id: "yield", topic: "yield", ingredientIndex: null, source: "", question: "¿Cuánto rinde esta receta?", options: [] });
  }
  const yieldQuestion = questions.find((item) => item.topic === "yield");
  // "p/ 40 porc", "para 12 personas": the source states the yield even if the model missed it. Offered first.
  const stated = /(?:p\/|para)\s*(\d+)\s*(porc(?:iones|\.)?|personas|pax|unidades|u\b)/i.exec(text(raw.title, 200));
  if (yieldQuestion && stated) {
    const portions = /^(u|unidades)/i.test(stated[2]) ? "un" as Unit : "porción" as Unit;
    yieldQuestion.options.unshift({ label: `${stated[1]} ${portions === "un" ? "unidades" : "porciones"} (dice la fuente)`, yieldMilli: Number(stated[1]) * 1000, yieldUnit: portions });
    if (!yieldQuestion.source) yieldQuestion.source = stated[0];
  }
  const mass = totalMassMilli(ingredients);
  if (yieldQuestion && mass) {
    // Deterministic suggestion: pieces of N g stated in the title, or the whole batch by weight. Offered, never applied.
    const piece = /(\d+(?:[.,]\d+)?)\s*(g|gr|grs|grm|grms|gramos)\b/i.exec(text(raw.title, 200));
    const pieceMilli = piece ? milli(piece[1]) : null;
    const options: DraftOption[] = [];
    if (pieceMilli) {
      const pieces = Math.floor(mass / pieceMilli);
      options.push({ label: `${pieces} unidades de ${piece![1]} g (masa total ÷ peso por unidad)`, yieldMilli: pieces * 1000, yieldUnit: "un" });
    }
    options.push({ label: `${(mass / 1_000_000).toLocaleString("es-UY", { maximumFractionDigits: 3 })} kg de masa total`, yieldMilli: Math.round(mass / 1000), yieldUnit: "kg" as Unit });
    yieldQuestion.options = [...yieldQuestion.options.filter((option) => option.yieldMilli), ...options, ...yieldQuestion.options.filter((option) => !option.yieldMilli)].slice(0, 4);
    if (!yieldQuestion.source) yieldQuestion.source = text(raw.title, 200);
  }
  ingredients.forEach((item, index) => {
    if ((item.amountMilli === null || item.unit === null) && !questions.some((question) => question.topic === "ingredient" && question.ingredientIndex === index)) {
      questions.push({ id: `i${index}`, topic: "ingredient", ingredientIndex: index, source: item.source || item.name, question: `¿Qué cantidad de ${item.name} lleva?`, options: [] });
    }
  });
  if (steps.length && suggestedSteps.length) {
    questions.splice(0, questions.length, ...questions.filter((item) => item.topic !== "steps"), {
      id: "steps", topic: "steps", ingredientIndex: null, source: steps.map((step) => step.instruction).join(" · ").slice(0, 300),
      question: "El procedimiento de la fuente está incompleto. Te propongo uno completo que respeta lo escrito: ¿lo usás?",
      options: [{ label: "Usar el completo y revisarlo", steps: "suggested" }, { label: "Quedarme con lo de la fuente", steps: "source" }],
    });
  }
  if (!steps.length) {
    // Replace whatever the model asked about steps with the fixed choice: accept the suggestion, write it, or skip.
    const kept = questions.filter((item) => item.topic !== "steps");
    questions.length = 0;
    questions.push(...kept, {
      id: "steps", topic: "steps", ingredientIndex: null, source: "",
      question: suggestedSteps.length ? "La fuente no trae procedimiento. Te propongo uno: ¿lo usás?" : "La fuente no trae procedimiento. ¿Cómo seguimos?",
      options: [
        ...(suggestedSteps.length ? [{ label: "Usar el sugerido y revisarlo", steps: "suggested" as const }] : []),
        { label: "Lo escribo yo", steps: "write" as const },
        { label: "Guardar sin procedimiento por ahora", steps: "none" as const },
      ],
    });
  }
  return { title: text(raw.title, 200), yieldMilli, yieldUnit, ingredients, steps, suggestedSteps, questions };
}

/** Extracts the first JSON object from a model reply, ignoring reasoning blocks or code fences. */
export function extractJson(reply: string): RawDraft {
  const clean = reply.replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("El modelo no devolvió una receta");
  return JSON.parse(clean.slice(start, end + 1)) as RawDraft;
}

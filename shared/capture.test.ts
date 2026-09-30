import { describe, expect, it } from "vitest";
import { extractJson, normalizeDraft, normalizeUnit } from "./capture";

const pancitos = {
  title: "Pancitos de 30 grms para paneras",
  yield: { amount: null, unit: null, source: "" },
  ingredients: [
    { name: "harina", amount: 1.25, unit: "k", source: "1.250k harina" },
    { name: "azúcar", amount: 40, unit: "g", source: "40g azúcar" },
    { name: "sal", amount: 25, unit: "g", source: "25g sal" },
    { name: "levadura", amount: 60, unit: "g", source: "60g levadura" },
    { name: "aceite", amount: 300, unit: "g", source: "300g Aceite" },
    { name: "agua tibia", amount: 625, unit: "g", source: "625g agua tibia" },
  ],
  steps: [],
  suggestedSteps: [{ title: "Amasar", instruction: "Mezclar secos, agregar líquidos y amasar 10 min." }],
  questions: [],
};

describe("captura de recetas", () => {
  it("normaliza unidades escritas en cocina", () => {
    expect(normalizeUnit("k")).toBe("kg");
    expect(normalizeUnit("grms")).toBe("g");
    expect(normalizeUnit("cc")).toBe("ml");
    expect(normalizeUnit("Lts")).toBe("L");
    expect(normalizeUnit("dientes")).toBeNull();
  });

  it("no inventa rendimiento: pregunta y sugiere piezas por peso de masa", () => {
    const draft = normalizeDraft(pancitos);
    expect(draft.yieldMilli).toBeNull();
    const question = draft.questions.find((item) => item.topic === "yield")!;
    expect(question.options[0]).toMatchObject({ yieldMilli: 76_000, yieldUnit: "un" });
    expect(question.options[1]).toMatchObject({ yieldMilli: 2_300, yieldUnit: "kg" });
    expect(draft.ingredients[0]).toMatchObject({ amountMilli: 1_250, unit: "kg" });
  });

  it("el procedimiento propuesto queda aparte y exige elegir", () => {
    const draft = normalizeDraft(pancitos);
    expect(draft.steps).toHaveLength(0);
    expect(draft.suggestedSteps).toHaveLength(1);
    const question = draft.questions.find((item) => item.topic === "steps")!;
    expect(question.options.map((option) => option.steps)).toEqual(["suggested", "write", "none"]);
  });

  it("con procedimiento completo en la fuente no ofrece otro", () => {
    const draft = normalizeDraft({ ...pancitos, steps: [{ title: "Amasar", instruction: "Amasar todo" }, { title: "Hornear", instruction: "Hornear" }] });
    expect(draft.suggestedSteps).toHaveLength(0);
    expect(draft.questions.some((item) => item.topic === "steps")).toBe(false);
  });

  it("con procedimiento parcial ofrece el completo o quedarse con la fuente", () => {
    const draft = normalizeDraft({
      ...pancitos, steps: [{ title: "Hornear", instruction: "horno 160 a baño maría 50 min" }],
      suggestedSteps: [{ title: "Caramelo", instruction: "Hacer caramelo" }, { title: "Mezclar", instruction: "Mezclar" }, { title: "Hornear", instruction: "Horno 160 °C a baño maría 50 min" }],
    });
    expect(draft.suggestedSteps).toHaveLength(3);
    expect(draft.questions.find((item) => item.topic === "steps")!.options.map((option) => option.steps)).toEqual(["suggested", "source"]);
  });

  it("no pregunta la cantidad de lo que ya tiene cantidad", () => {
    const draft = normalizeDraft({ ...pancitos, questions: [{ topic: "ingredient", ingredientIndex: 1, question: "¿Qué cantidad de azúcar se usa?", options: ["40 g"] }] });
    expect(draft.questions.some((item) => /azúcar/.test(item.question))).toBe(false);
  });

  it("pregunta por cantidades faltantes aunque el modelo lo olvide y filtra opciones vacías", () => {
    const draft = normalizeDraft({
      title: "Salsa", yield: { amount: 40, unit: "porciones" },
      ingredients: [{ name: "sal", amount: null, unit: null, source: "sal c/n" }],
      steps: [{ title: "Cocinar", instruction: "Cocinar 40 min" }],
      questions: [{ topic: "other", question: "¿Cuándo va la sal?", options: ["Al inicio", "otro"] }],
    });
    expect(draft.yieldMilli).toBe(40_000);
    expect(draft.questions.find((item) => item.topic === "other")!.options).toEqual([{ label: "Al inicio" }]);
    expect(draft.questions.some((item) => item.topic === "ingredient" && item.ingredientIndex === 0)).toBe(true);
  });

  it("lee JSON aunque venga con razonamiento o texto alrededor", () => {
    expect(extractJson('<think>pienso</think>Acá va:\n{"title":"Pan"}').title).toBe("Pan");
    expect(() => extractJson("sin json")).toThrow();
  });
});

describe("preguntas de momento", () => {
  it("sin procedimiento en la fuente no pregunta cuándo va cada ingrediente", () => {
    const draft = normalizeDraft({
      title: "Pan", ingredients: [{ name: "agua", amount: 1, unit: "L" }], steps: [],
      questions: [{ topic: "other", question: "¿Cuándo se agrega el agua?", options: ["Al inicio", "Al final"] }],
    });
    expect(draft.questions.some((item) => /agua/.test(item.question))).toBe(false);
  });
});

describe("preguntas útiles", () => {
  it("descarta preferencias y mantiene la cantidad aunque haya otra pregunta sobre el ingrediente", () => {
    const draft = normalizeDraft({
      title: "Salsa", yield: { amount: 1, unit: "L" },
      ingredients: [{ name: "sal", amount: null, unit: null, source: "sal c/n" }],
      steps: [{ title: "Cocinar", instruction: "Cocinar" }],
      questions: [
        { topic: "other", question: "¿Qué tipo de sal preferís?", options: ["Fina", "Gruesa"] },
        { topic: "other", ingredientIndex: 0, question: "¿En qué momento se agrega la sal?", options: ["Al inicio", "Al final"] },
      ],
    });
    expect(draft.questions.some((item) => /tipo/.test(item.question))).toBe(false);
    expect(draft.questions.some((item) => item.topic === "ingredient" && item.ingredientIndex === 0)).toBe(true);
    expect(draft.questions.some((item) => /momento/.test(item.question))).toBe(true);
  });
});

describe("tema de la pregunta", () => {
  it("una pregunta de ingrediente con cantidad conocida no pide cantidad", () => {
    const draft = normalizeDraft({
      title: "Pan", yield: { amount: 1, unit: "kg" }, ingredients: [{ name: "agua", amount: 625, unit: "g" }],
      steps: [{ title: "Amasar", instruction: "Amasar con el agua" }],
      questions: [{ topic: "ingredient", ingredientIndex: 0, question: "¿Se agrega de a poco?", options: ["Sí", "No"] }],
    });
    expect(draft.questions[0].topic).toBe("other");
  });
});

describe("estabilidad ante el modelo", () => {
  it("rendimiento escrito en el título se ofrece aunque el modelo no lo tome", () => {
    const draft = normalizeDraft({ title: "Salsa pomodoro p/ 40 porc", ingredients: [{ name: "tomate", amount: 4, unit: "kg" }], steps: [{ title: "Cocinar", instruction: "Cocinar" }] });
    expect(draft.questions.find((item) => item.topic === "yield")!.options[0]).toMatchObject({ yieldMilli: 40_000, yieldUnit: "porción" });
  });

  it("una pregunta de momento no se trata como cantidad y no tapa la cantidad faltante", () => {
    const draft = normalizeDraft({
      title: "Salsa", yield: { amount: 1, unit: "L" }, ingredients: [{ name: "sal", amount: null, unit: null }],
      steps: [{ title: "Cocinar", instruction: "Cocinar" }],
      questions: [{ topic: "ingredient", ingredientIndex: 0, question: "¿En qué momento se agrega la sal?", options: ["Al inicio", "Al final"] }],
    });
    expect(draft.questions.find((item) => /momento/.test(item.question))!.topic).toBe("other");
    expect(draft.questions.some((item) => item.topic === "ingredient" && item.ingredientIndex === 0)).toBe(true);
  });
});

describe("cantidades compartidas en una línea", () => {
  it("la segunda cantidad hereda unidad y nombre del ingrediente", () => {
    const source = "200 g azucar + 150 p/caramelo";
    const draft = normalizeDraft({
      title: "Flan", yield: { amount: 8, unit: "porciones" }, steps: [{ title: "Hornear", instruction: "Hornear" }],
      ingredients: [{ name: "azucar", amount: 200, unit: "g", source }, { name: "caramelo", amount: 150, unit: null, source }],
      questions: [{ topic: "other", question: "¿Qué significa 'p' en '150 p/caramelo'?", options: ["para", "por"] }],
    });
    expect(draft.ingredients[1]).toMatchObject({ name: "azucar para caramelo", amountMilli: 150_000, unit: "g" });
    expect(draft.questions.some((item) => /significa/.test(item.question))).toBe(false);
  });

  it("reconoce la misma línea aunque el modelo parta la fuente", () => {
    const draft = normalizeDraft({
      title: "Flan", yield: { amount: 8, unit: "porciones" }, steps: [{ title: "Hornear", instruction: "Hornear" }],
      ingredients: [{ name: "azucar", amount: 200, unit: "g", source: "200 g azucar" }, { name: "caramelo", amount: 150, unit: null, source: "150 p/caramelo" }],
    }, "Flan\n200 g azucar + 150 p/caramelo");
    expect(draft.ingredients[1]).toMatchObject({ name: "azucar para caramelo", unit: "g" });
  });
});

describe("recuperación desde la fuente", () => {
  it("recupera la cantidad copiada en la fuente, sin robarla de otro ingrediente", () => {
    const draft = normalizeDraft({
      title: "Salsa", yield: { amount: 1, unit: "L" }, steps: [{ title: "Cocinar", instruction: "Cocinar" }],
      ingredients: [
        { name: "albahaca", amount: null, unit: "atado", source: "albahaca 1 atado" },
        { name: "cebolla", amount: 2, unit: "kg", source: "2 kg cebolla y sal" },
        { name: "sal", amount: null, unit: null, source: "2 kg cebolla y sal" },
      ],
    });
    expect(draft.ingredients[0]).toMatchObject({ amountMilli: 1_000, unit: "atado" });
    expect(draft.ingredients[2]).toMatchObject({ amountMilli: null, unit: null });
  });
});

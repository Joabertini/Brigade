export type Unit = "g" | "kg" | "ml" | "L" | "un" | "atado" | "paq" | "bandeja" | "porción";

export interface IngredientAmount {
  id: string;
  name: string;
  /** Thousandths of the stated unit. No floating point quantities in storage. */
  netMilli: number;
  unit: Unit;
  /** 0–999. 200 means 20% lost while cleaning. */
  wastePermille: number;
}

export interface RecipeStep {
  id: string;
  title: string;
  instruction: string;
  ingredientIds: string[];
}

export interface RecipeVersion {
  id: string;
  recipeId: string;
  version: number;
  title: string;
  description: string;
  yieldMilli: number;
  yieldUnit: Unit;
  ingredients: IngredientAmount[];
  steps: RecipeStep[];
  confirmedByChef: boolean;
}

export interface ScaledIngredient extends IngredientAmount {
  requiredNetMilli: number;
  requiredGrossMilli: number;
}

export function assertPositiveMilli(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label}: cantidad inválida`);
}

function multiplyDivideRound(value: number, numerator: number, denominator: number): number {
  const result = (BigInt(value) * BigInt(numerator) + BigInt(denominator) / 2n) / BigInt(denominator);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Cantidad fuera de rango");
  return Number(result);
}

function multiplyDivideCeil(value: number, numerator: number, denominator: number): number {
  const result = (BigInt(value) * BigInt(numerator) + BigInt(denominator) - 1n) / BigInt(denominator);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Cantidad fuera de rango");
  return Number(result);
}

export function scaleRecipe(version: RecipeVersion, targetYieldMilli: number): ScaledIngredient[] {
  if (!version.confirmedByChef) throw new Error("La receta requiere confirmación del chef");
  assertPositiveMilli(version.yieldMilli, "Rendimiento base");
  assertPositiveMilli(targetYieldMilli, "Rendimiento objetivo");
  return version.ingredients.map((ingredient) => {
    assertPositiveMilli(ingredient.netMilli, ingredient.name);
    if (!Number.isInteger(ingredient.wastePermille) || ingredient.wastePermille < 0 || ingredient.wastePermille >= 1000)
      throw new Error(`${ingredient.name}: merma inválida`);
    const requiredNetMilli = multiplyDivideRound(ingredient.netMilli, targetYieldMilli, version.yieldMilli);
    const requiredGrossMilli = multiplyDivideCeil(requiredNetMilli, 1000, 1000 - ingredient.wastePermille);
    return { ...ingredient, requiredNetMilli, requiredGrossMilli };
  });
}

export function formatMilli(milli: number, unit: Unit): string {
  if (!Number.isSafeInteger(milli) || milli < 0) throw new Error("Cantidad inválida");
  const whole = Math.floor(milli / 1000);
  const fraction = String(milli % 1000).padStart(3, "0").replace(/0+$/, "");
  const displayUnit = unit === "porción" && milli !== 1000 ? "porciones" : unit;
  return `${whole}${fraction ? "," + fraction : ""} ${displayUnit}`;
}

export function parseMilli(value: string): number {
  const clean = value.trim().replace(",", ".");
  if (!/^(?:\d+)(?:\.\d{1,3})?$/.test(clean)) throw new Error("Ingresá una cantidad positiva con hasta 3 decimales");
  const [whole, fraction = ""] = clean.split(".");
  const milli = Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
  assertPositiveMilli(milli, "Cantidad");
  return milli;
}

export function shortage(required: ScaledIngredient, availableMilli: number): number {
  if (!Number.isSafeInteger(availableMilli) || availableMilli < 0) throw new Error("Stock inválido");
  return Math.max(0, required.requiredGrossMilli - availableMilli);
}

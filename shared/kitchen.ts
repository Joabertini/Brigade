export type Unit = "g" | "kg" | "ml" | "L" | "un" | "atado" | "paq" | "bandeja" | "porción";
export type StockUnit = "g" | "ml" | "un" | "atado" | "paq" | "bandeja";

export interface IngredientAmount {
  id: string;
  name: string;
  catalogIngredientId?: string | null;
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

export function scaleIngredient<T extends IngredientAmount>(ingredient: T, baseYieldMilli: number, targetYieldMilli: number): T & ScaledIngredient {
  assertPositiveMilli(baseYieldMilli, "Rendimiento base");
  assertPositiveMilli(targetYieldMilli, "Rendimiento objetivo");
  assertPositiveMilli(ingredient.netMilli, ingredient.name);
  if (!Number.isInteger(ingredient.wastePermille) || ingredient.wastePermille < 0 || ingredient.wastePermille >= 1000)
    throw new Error(`${ingredient.name}: merma inválida`);
  const requiredNetMilli = multiplyDivideRound(ingredient.netMilli, targetYieldMilli, baseYieldMilli);
  const requiredGrossMilli = multiplyDivideCeil(requiredNetMilli, 1000, 1000 - ingredient.wastePermille);
  return { ...ingredient, requiredNetMilli, requiredGrossMilli };
}

export function scaleRecipe(version: RecipeVersion, targetYieldMilli: number): ScaledIngredient[] {
  if (!version.confirmedByChef) throw new Error("La receta requiere confirmación del chef");
  assertPositiveMilli(version.yieldMilli, "Rendimiento base");
  assertPositiveMilli(targetYieldMilli, "Rendimiento objetivo");
  return version.ingredients.map((ingredient) => scaleIngredient(ingredient, version.yieldMilli, targetYieldMilli));
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

export function compatibleStockUnit(recipeUnit: Unit, stockUnit: StockUnit): boolean {
  return recipeUnit === stockUnit || (recipeUnit === "kg" && stockUnit === "g") || (recipeUnit === "L" && stockUnit === "ml");
}

export function toStockMilli(amountMilli: number, recipeUnit: Unit, stockUnit: StockUnit): number {
  if (!Number.isSafeInteger(amountMilli) || amountMilli < 0 || !compatibleStockUnit(recipeUnit, stockUnit)) {
    throw new Error("Unidad de receta incompatible con el catálogo");
  }
  const factor = recipeUnit === "kg" || recipeUnit === "L" ? 1000 : 1;
  const converted = amountMilli * factor;
  if (!Number.isSafeInteger(converted)) throw new Error("Cantidad fuera de rango");
  return converted;
}

export function remainingRequirement(requiredMilli: number, targetYieldMilli: number, producedYieldMilli: number): number {
  if (![requiredMilli, targetYieldMilli, producedYieldMilli].every(Number.isSafeInteger) ||
    requiredMilli < 0 || targetYieldMilli <= 0 || producedYieldMilli < 0) throw new Error("Producción inválida");
  const remaining = Math.max(0, targetYieldMilli - producedYieldMilli);
  const result = (BigInt(requiredMilli) * BigInt(remaining) + BigInt(targetYieldMilli) - 1n) / BigInt(targetYieldMilli);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Cantidad fuera de rango");
  return Number(result);
}

/** Display a stock quantity in the largest readable unit: 2 500 000 g-milli → "2,5 kg". */
export function formatStock(milli: number, unit: StockUnit): string {
  if ((unit === "g" || unit === "ml") && milli >= 1_000_000) {
    const big = Math.round(milli / 1000);
    return formatMilli(big, unit === "g" ? "kg" : "L");
  }
  return formatMilli(milli, unit);
}

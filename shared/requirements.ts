import { remainingRequirement, type StockUnit, type Unit } from "./kitchen";

export interface RequirementRow {
  productionId: string;
  productionTitle: string;
  ingredientName: string;
  catalogIngredientId: string | null;
  unit: Unit;
  baseUnit: StockUnit | null;
  requiredGrossMilli: number;
  requiredBaseMilli: number | null;
  targetYieldMilli: number;
  producedYieldMilli: number;
}

export interface IngredientNeed {
  ingredientId: string;
  name: string;
  unit: StockUnit;
  requiredMilli: number;
  availableMilli: number;
  incomingMilli: number;
  shortageMilli: number;
}

export interface UnlinkedNeed {
  productionId: string;
  productionTitle: string;
  ingredientName: string;
  unit: Unit;
  requiredMilli: number;
}

function safeAdd(left: number, right: number): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw new Error("Cantidad fuera de rango");
  return value;
}

export function summarizeRequirements(
  rows: RequirementRow[],
  stock: Map<string, number>,
  incoming: Map<string, number>,
): { needs: IngredientNeed[]; unlinked: UnlinkedNeed[] } {
  const linked = new Map<string, IngredientNeed>();
  const unlinked: UnlinkedNeed[] = [];
  for (const row of rows) {
    if (!row.catalogIngredientId || !row.baseUnit || row.requiredBaseMilli === null) {
      const requiredMilli = remainingRequirement(row.requiredGrossMilli, row.targetYieldMilli, row.producedYieldMilli);
      if (requiredMilli) unlinked.push({
        productionId: row.productionId, productionTitle: row.productionTitle,
        ingredientName: row.ingredientName, unit: row.unit, requiredMilli,
      });
      continue;
    }
    const requiredMilli = remainingRequirement(row.requiredBaseMilli, row.targetYieldMilli, row.producedYieldMilli);
    if (!requiredMilli) continue;
    const previous = linked.get(row.catalogIngredientId);
    if (previous) previous.requiredMilli = safeAdd(previous.requiredMilli, requiredMilli);
    else linked.set(row.catalogIngredientId, {
      ingredientId: row.catalogIngredientId, name: row.ingredientName, unit: row.baseUnit,
      requiredMilli, availableMilli: 0, incomingMilli: 0, shortageMilli: 0,
    });
  }
  const needs = [...linked.values()].map((need) => {
    const availableMilli = stock.get(need.ingredientId) ?? 0;
    const incomingMilli = incoming.get(need.ingredientId) ?? 0;
    if (![availableMilli, incomingMilli].every(Number.isSafeInteger) || availableMilli < 0 || incomingMilli < 0) {
      throw new Error("Saldo de ingrediente inválido");
    }
    return { ...need, availableMilli, incomingMilli,
      shortageMilli: Math.max(0, need.requiredMilli - availableMilli - incomingMilli) };
  }).sort((a, b) => a.name.localeCompare(b.name, "es"));
  return { needs, unlinked };
}

import { describe, expect, it } from "vitest";
import { formatMilli, parseMilli, scaleRecipe, shortage, type RecipeVersion } from "./kitchen";

const recipe: RecipeVersion = {
  id: "v1", recipeId: "r1", version: 1, title: "Crema", description: "",
  yieldMilli: 20_000, yieldUnit: "porción", confirmedByChef: true,
  ingredients: [
    { id: "calabaza", name: "Calabaza", netMilli: 3_000_000, unit: "g", wastePermille: 200 },
    { id: "sal", name: "Sal", netMilli: 15_000, unit: "g", wastePermille: 0 },
  ],
  steps: [],
};

describe("cálculos de producción", () => {
  it("escala rendimiento, neto y bruto por merma sin floats persistidos", () => {
    const [calabaza, sal] = scaleRecipe(recipe, 40_000);
    expect(calabaza.requiredNetMilli).toBe(6_000_000);
    expect(calabaza.requiredGrossMilli).toBe(7_500_000);
    expect(sal.requiredGrossMilli).toBe(30_000);
    expect(shortage(calabaza, 2_000_000)).toBe(5_500_000);
  });

  it("mantiene la unidad y redondea el bruto hacia arriba", () => {
    const [item] = scaleRecipe({ ...recipe, ingredients: [{ id: "a", name: "A", netMilli: 1_001, unit: "g", wastePermille: 333 }] }, 20_000);
    expect(item.requiredGrossMilli).toBe(1_501);
  });

  it("no escala recetas sin confirmar ni acepta rendimiento cero", () => {
    expect(() => scaleRecipe({ ...recipe, confirmedByChef: false }, 40_000)).toThrow();
    expect(() => scaleRecipe(recipe, 0)).toThrow();
  });

  it("lee cantidades con coma decimal y hasta milésimas", () => {
    expect(parseMilli("2,125")).toBe(2_125);
    expect(formatMilli(2_125, "kg")).toBe("2,125 kg");
    expect(() => parseMilli("2,1234")).toThrow();
  });
});

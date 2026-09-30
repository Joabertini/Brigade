import { describe, expect, it } from "vitest";
import { compatibleStockUnit, remainingRequirement, toStockMilli } from "./kitchen";
import { summarizeRequirements, type RequirementRow } from "./requirements";

describe("requerimientos de producción", () => {
  it("convierte kg a g y L a ml sin mezclar unidades", () => {
    expect(toStockMilli(1_250, "kg", "g")).toBe(1_250_000);
    expect(toStockMilli(500, "L", "ml")).toBe(500_000);
    expect(compatibleStockUnit("un", "g")).toBe(false);
    expect(() => toStockMilli(1_000, "un", "g")).toThrow();
  });

  it("calcula solo lo pendiente y redondea hacia arriba", () => {
    expect(remainingRequirement(10_001, 10_000, 2_500)).toBe(7_501);
    expect(remainingRequirement(10_001, 10_000, 11_000)).toBe(0);
  });

  it("agrupa producciones, descuenta stock y pedidos en tránsito una sola vez", () => {
    const base: RequirementRow = {
      productionId: "p1", productionTitle: "Pan", ingredientName: "Harina", catalogIngredientId: "harina",
      unit: "kg", baseUnit: "g", requiredGrossMilli: 2_000, requiredBaseMilli: 2_000_000,
      targetYieldMilli: 10_000, producedYieldMilli: 0,
    };
    const result = summarizeRequirements([
      base, { ...base, productionId: "p2", producedYieldMilli: 5_000 },
      { ...base, productionId: "p3", catalogIngredientId: null, baseUnit: null, requiredBaseMilli: null, ingredientName: "Sal" },
    ], new Map([["harina", 500_000]]), new Map([["harina", 700_000]]));
    expect(result.needs[0]).toMatchObject({ requiredMilli: 3_000_000, shortageMilli: 1_800_000 });
    expect(result.unlinked).toHaveLength(1);
  });
});

describe("formato de stock", () => {
  it("pasa a kg y L desde mil unidades base", async () => {
    const { formatStock } = await import("./kitchen");
    expect(formatStock(2_500_000, "g")).toBe("2,5 kg");
    expect(formatStock(300_000, "ml")).toBe("300 ml");
    expect(formatStock(1_000_000, "ml")).toBe("1 L");
    expect(formatStock(12_000, "un")).toBe("12 un");
  });
});

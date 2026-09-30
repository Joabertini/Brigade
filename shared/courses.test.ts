import { describe, expect, it } from "vitest";
import { cleanCourse, groupByCourse, mergeCourses } from "./courses";

describe("cursos de la carta", () => {
  it("agrega los propios después de los tres de base, sin duplicar", () => {
    expect(mergeCourses(["Cortesías", "postres", "Cortesías"])).toEqual(["Entradas", "Principales", "Postres", "Cortesías"]);
  });

  it("limpia el nombre y rechaza vacío o largo", () => {
    expect(cleanCourse("  Cortesías   appetizers ")).toBe("Cortesías appetizers");
    expect(cleanCourse("   ")).toBeNull();
    expect(cleanCourse("x".repeat(61))).toBeNull();
    expect(cleanCourse(4)).toBeNull();
  });

  it("agrupa por curso y deja lo sin curso al final", () => {
    const items = [{ t: "flan", c: "postres" }, { t: "crema", c: null }, { t: "croquetas", c: "Entradas" }, { t: "raro", c: "Borrado" }];
    const sections = groupByCourse(items, mergeCourses([]), (item) => item.c);
    expect(sections.map((section) => [section.name, section.items.map((item) => item.t)])).toEqual([
      ["Entradas", ["croquetas"]], ["Principales", []], ["Postres", ["flan"]], [null, ["crema", "raro"]],
    ]);
  });

  it("sin recetas sueltas no agrega la sección final", () => {
    expect(groupByCourse([], mergeCourses([]), () => null)).toHaveLength(3);
  });
});

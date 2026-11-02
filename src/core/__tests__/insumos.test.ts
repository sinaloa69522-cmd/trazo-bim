import { describe, expect, it } from "vitest";
import { insumos } from "../insumos";
import { TEMPLATES } from "../templates";

describe("explosión de insumos", () => {
  const list = insumos(TEMPLATES[1].build());
  const q = (re: RegExp) => list.filter((x) => re.test(x.name)).reduce((s, x) => s + x.qty, 0);
  it("calcula cemento, agregados, varilla, tabique, teja y pisos", () => {
    expect(q(/^Cemento/)).toBeGreaterThan(100);
    expect(q(/^Arena/)).toBeGreaterThan(5);
    expect(q(/^Grava/)).toBeGreaterThan(5);
    expect(q(/^Varilla/)).toBeGreaterThan(500);
    expect(q(/^Tabique/)).toBeGreaterThan(5000);
    expect(q(/^Teja/)).toBeGreaterThan(1000);
    expect(q(/Porcelanato/)).toBeGreaterThan(50);
  });
  it("redondea piezas y bultos hacia arriba y agrupa en orden", () => {
    for (const x of list) if (["pza", "bulto", "cubeta"].includes(x.unit)) expect(Number.isInteger(x.qty)).toBe(true);
    const groups = list.map((x) => x.group);
    expect(groups[0]).toBe("Concreto y agregados");
    expect(new Set(list.map((x) => `${x.group}|${x.name}|${x.unit}`)).size).toBe(list.length);
  });
  it("un proyecto vacío no lleva materiales", () => {
    const p = TEMPLATES[0].build();
    for (const l of p.levels) { l.walls = []; l.slabs = []; l.roofs = []; l.runs = []; l.fixtures = []; l.openings = []; l.rooms = []; }
    expect(insumos(p)).toEqual([]);
  });
});

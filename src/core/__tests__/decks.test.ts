import { describe, expect, it } from "vitest";
import { DECK_TYPES, deckBoxes, deckFraming, deckGeom, deckTakeoff, fitDecks, STEP_DOWN } from "../decks";
import { gradeLevel } from "../foundation";
import { normalizeProject, sampleProject, type Deck } from "../model";
import { budget } from "../budget";
import { IN } from "../units";

const house = () => {
  const ws = sampleProject().levels[0].walls;
  const ys = ws.flatMap((w) => [w.y1, w.y2]), xs = ws.flatMap((w) => [w.x1, w.x2]);
  return { ws, x0: Math.min(...xs), x1: Math.max(...xs), y1: Math.max(...ys) };
};
// deck de 4 x 3 m pegado a la fachada de abajo de la casa de ejemplo
const make = (o: Partial<Deck> = {}): Deck => {
  const h = house();
  return { id: 1, x1: h.x0 + 0.5, y1: h.y1 + 0.07, x2: h.x0 + 4.5, y2: h.y1 + 3.07, kind: "wood", height: 30 * IN, rail: "wood", stairSide: 2, stairW: 36 * IN, stairT: 0.5, ...o };
};

describe("decks y porches", () => {
  it("detecta el lado de la casa y no le pone barandal", () => {
    const g = deckGeom(make(), house().ws);
    expect(g.house).toBe(0);
    expect(g.guards.every(([a, b]) => !(Math.abs(a.y - g.y0) < 1e-6 && Math.abs(b.y - g.y0) < 1e-6))).toBe(true);
  });

  it("los escalones cumplen el IRC: contrahuella ≤ 7 3/4\" y hueco en el barandal", () => {
    const d = make(), g = deckGeom(d, house().ws), q = deckTakeoff(d, house().ws);
    expect(g.steps).not.toBeNull();
    expect(g.steps!.riser).toBeLessThanOrEqual(7.75 * IN + 1e-9);
    expect(g.steps!.n * g.steps!.riser).toBeCloseTo(d.height, 6);
    expect(g.steps!.treads.length).toBe(g.steps!.n);
    // perímetro libre (3 lados) menos el ancho de la escalera
    expect(q.guard).toBeCloseTo(4 + 3 + 3 - 36 * IN, 3);
    expect(g.handrailRequired).toBe(true);
    expect(g.handrails.length).toBe(2);
  });

  it("barandal obligatorio por encima de 30\"", () => {
    expect(deckGeom(make({ height: 30 * IN })).guardRequired).toBe(false);
    expect(deckGeom(make({ height: 31 * IN })).guardRequired).toBe(true);
  });

  it("cada tipo genera piezas 3D y estructura válidas", () => {
    for (const t of DECK_TYPES) {
      const d = make({ kind: t.id, height: t.height, rail: t.rail });
      const bs = deckBoxes(d, house().ws, 0), ms = deckFraming(d, house().ws, 0);
      expect(bs.length).toBeGreaterThan(0);
      for (const b of bs) expect(Number.isFinite(b.a.x + b.a.y + b.a.z + b.b.x + b.b.y + b.b.z + b.w + b.h)).toBe(true);
      expect(ms.length).toBeGreaterThan(0);
      if (!t.concrete) expect(ms.some((m) => m.kind === "floorJoist")).toBe(true);
      if (t.roof) expect(ms.some((m) => m.kind === "rafter")).toBe(true);
    }
  });

  it("el deck de madera pegado a la casa lleva ledger; el exento, viga en los dos lados", () => {
    const ms = deckFraming(make(), house().ws, 0), free = deckFraming(make({ y1: 30, y2: 33 }), house().ws, 0);
    expect(ms.some((m) => /LEDGER/.test(m.size))).toBe(true);
    expect(free.some((m) => /LEDGER/.test(m.size))).toBe(false);
  });

  it("se conserva al normalizar y entra en el presupuesto", () => {
    const p = sampleProject();
    p.levels[0].decks = [make()];
    const n = normalizeProject(JSON.parse(JSON.stringify(p)));
    expect(n.levels[0].decks).toHaveLength(1);
    const old = JSON.parse(JSON.stringify(sampleProject()));
    delete old.levels[0].decks;
    expect(normalizeProject(old).levels[0].decks).toEqual([]);
    expect(budget(p).chapters.flatMap((c) => c.items).some((i) => i.desc === "Deck de madera tratada")).toBe(true);
  });

  it("pegado a la casa, su piso queda 1\" bajo el de la casa y apoya en el terreno", () => {
    for (const f of ["slab", "crawl"] as const) {
      const p = { ...sampleProject(), foundation: f }, d = make(), free = make({ id: 2, y1: 30, y2: 33 });
      p.levels[0].decks = [d, free];
      fitDecks(p);
      const gr = gradeLevel(p);
      expect(gr + d.height).toBeCloseTo(p.levels[0].elev - STEP_DOWN, 6);
      expect(free.height).toBeCloseTo(30 * IN, 6);
      const bs = deckBoxes(d, p.levels[0].walls, gr);
      expect(Math.max(...bs.map((b) => Math.max(b.a.z, b.b.z) + b.h / 2))).toBeGreaterThan(p.levels[0].elev);
      expect(Math.min(...bs.map((b) => Math.min(b.a.z, b.b.z)))).toBeLessThan(gr + 0.03);
    }
    const p = sampleProject(), d = make({ matchFloor: false, height: 1 });
    p.levels[0].decks = [d];
    fitDecks(p);
    expect(d.height).toBe(1);
  });
});

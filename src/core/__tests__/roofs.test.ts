import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { toDxf } from "../dxf";
import { roofGeom, stairSteps } from "../geometry";
import type { Roof } from "../model";

const roof = (kind: Roof["kind"], x2 = 10, y2 = 6): Roof =>
  ({ id: 1, x1: 0, y1: 0, x2, y2, kind, pitch: 45, overhang: 0.5, base: 2.7, thick: 0.15 });

describe("cubiertas", () => {
  it("a dos aguas: cumbrera en la dirección larga a la altura que da la pendiente", () => {
    const g = roofGeom(roof("gable"));
    expect(g.ridges).toHaveLength(1);
    const [a, b] = g.ridges[0];
    expect(a.y).toBeCloseTo(3); expect(b.y).toBeCloseTo(3);
    expect(Math.abs(b.x - a.x)).toBeCloseTo(11); // incluye el vuelo
    expect(g.top).toBeCloseTo(2.7 + 3 + 0.15 * Math.SQRT2); // 45°: sube lo mismo que la media luz, más el espesor
    expect(g.faces).toHaveLength(2);
    // los hastiales quedan sobre los muros extremos, sin el vuelo
    expect(g.gables.flat().every((p) => p.x === 0 || p.x === 10)).toBe(true);
  });

  it("a cuatro aguas: cumbrera más corta y cuatro faldones", () => {
    const g = roofGeom(roof("hip"));
    expect(g.faces).toHaveLength(4);
    expect(g.ridges).toHaveLength(5);
    const [a, b] = g.ridges[0];
    expect(Math.abs(b.x - a.x)).toBeCloseTo(11 - 7);
  });

  it("gira la cumbrera si el lado largo es vertical, y la plana no tiene cumbrera", () => {
    const [a, b] = roofGeom(roof("gable", 4, 9)).ridges[0];
    expect(a.x).toBeCloseTo(2); expect(b.x).toBeCloseTo(2);
    expect(roofGeom(roof("flat")).ridges).toHaveLength(0);
  });

  it("se dibuja con dos esquinas y se exporta a DXF", () => {
    const ed = new Editor();
    ed.clear();
    ed.setTool("roof");
    ed.commitPoint({ x: 0, y: 0 });
    ed.commitPoint({ x: 8, y: 5 });
    expect(ed.model.roofs).toHaveLength(1);
    expect(ed.sel).toEqual({ type: "roof", id: ed.model.roofs[0].id });
    expect(toDxf(ed.model, null)).toContain("A-CUBIERTAS");
  });

  it("al duplicar un nivel no se copia la cubierta", () => {
    const ed = new Editor();
    expect(ed.model.roofs).toHaveLength(1);
    ed.addLevel(true);
    expect(ed.model.roofs).toHaveLength(0);
    expect(ed.model.walls.length).toBeGreaterThan(0);
  });
});

describe("escaleras", () => {
  it("reparte el desnivel en contrahuellas de unos 17.5 cm", () => {
    const k = stairSteps({ id: 1, x1: 0, y1: 0, x2: 4.5, y2: 0, width: 1, height: 3 });
    expect(k.n).toBe(17);
    expect(k.riser).toBeCloseTo(3 / 17);
    expect(k.tread).toBeCloseTo(4.5 / 17);
  });

  it("salva el desnivel hasta el nivel de arriba", () => {
    const ed = new Editor();
    ed.addLevel(false); // Planta 1 a 3.00 m
    ed.setActiveLevel(0);
    ed.setTool("stair");
    ed.commitPoint({ x: 7, y: 1 });
    ed.commitPoint({ x: 7, y: 6 });
    const st = ed.model.stairs[0];
    expect(st.height).toBeCloseTo(3);
    expect(ed.pick(7, 2)).toEqual({ type: "stair", id: st.id });
    expect(toDxf(ed.model, null)).toContain("A-ESCALERAS");
  });

  it("se mueve con MO como el resto de elementos", () => {
    const ed = new Editor();
    ed.clear();
    ed.setTool("stair");
    ed.commitPoint({ x: 0, y: 0 });
    ed.commitPoint({ x: 4, y: 0 });
    ed.setTool("move");
    ed.commitPoint({ x: 0, y: 0 });
    ed.commitPoint({ x: 1, y: 2 });
    expect(ed.model.stairs[0]).toMatchObject({ x1: 1, y1: 2, x2: 5, y2: 2 });
  });
});

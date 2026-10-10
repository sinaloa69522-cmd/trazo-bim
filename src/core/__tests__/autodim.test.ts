import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { allAutoDims, autoDims, interiorDims } from "../autodim";
import { dimGeom } from "../geometry";
import { sampleProject, type Dim } from "../model";

/** Cotas agrupadas por su línea (fachada + separación), cada una como lista de longitudes. */
function chains(dims: Omit<Dim, "id">[]) {
  const g = new Map<string, number[]>();
  for (const d of dims) {
    const k = dimGeom({ id: 0, ...d } as Dim);
    const key = `${Math.round(k.a.x * 100) / 100 === Math.round(k.b.x * 100) / 100 ? "x" + k.a.x.toFixed(2) : "y" + k.a.y.toFixed(2)}`;
    g.set(key, [...(g.get(key) ?? []), k.L]);
  }
  return g;
}

describe("acotado automático de fachadas", () => {
  const m = sampleProject().levels[0];
  const dims = autoDims(m);

  it("pone la cota total de cada fachada a cara exterior", () => {
    expect(dims.every((d) => d.auto)).toBe(true);
    const totals = [...chains(dims).values()].filter((c) => c.length === 1).map((c) => Math.round(c[0] * 100) / 100).sort();
    // 10 x 7 a ejes con muros de 0,25: 10,25 y 7,25 a cara exterior, en las cuatro fachadas
    expect(totals).toEqual([10.25, 10.25, 7.25, 7.25].sort());
  });

  it("cada cadena suma el total de su fachada", () => {
    const g = [...chains(dims).values()].map((c) => Math.round(c.reduce((t, x) => t + x, 0) * 100) / 100);
    for (const s of g) expect([10.25, 7.25]).toContain(s);
    // al menos una cadena de huecos y otra de muros además de las totales
    expect(g.length).toBeGreaterThan(4);
  });

  it("las cadenas quedan fuera del edificio, sin pisar los muros", () => {
    for (const d of dims) {
      const k = dimGeom({ id: 0, ...d } as Dim);
      const mid = { x: (k.a.x + k.b.x) / 2, y: (k.a.y + k.b.y) / 2 };
      const inside = mid.x > -0.125 && mid.x < 10.125 && mid.y > -0.125 && mid.y < 7.125;
      expect(inside).toBe(false);
    }
  });

  it("rehacer sustituye solo las automáticas y conserva las del usuario", () => {
    const ed = new Editor();
    ed.model.dims.push({ id: 9999, x1: 2, y1: 2, x2: 4, y2: 2, off: 0.3 });
    const own = ed.model.dims.filter((d) => !d.auto).length;
    ed.autoDimension();
    const n = ed.model.dims.length;
    expect(n).toBe(own + allAutoDims(ed.model).length);
    ed.runCommand("AC");
    expect(ed.model.dims.length).toBe(n);
    ed.clearAutoDims();
    expect(ed.model.dims.length).toBe(own);
    ed.undo();
    expect(ed.model.dims.length).toBe(n);
  });

  it("al dibujar se acota solo, y se deja de acotar al quitarlas", () => {
    const ed = new Editor();
    ed.project.levels[0].walls = []; ed.project.levels[0].dims = []; ed.project.levels[0].openings = [];
    ed.runCommand("M");
    for (const c of ["0;0", "8;0", "8;6", "0;6", "0;0"]) ed.runCommand(c);
    const auto = ed.model.dims.filter((d) => d.auto).length;
    expect(auto).toBeGreaterThanOrEqual(4);
    ed.clearAutoDims();
    ed.runCommand("M"); ed.runCommand("4;0"); ed.runCommand("4;6");
    expect(ed.model.dims.filter((d) => d.auto).length).toBe(0);
    ed.setLiveDims(true);
    expect(ed.model.dims.filter((d) => d.auto).length).toBeGreaterThanOrEqual(4);
  });

  it("cada habitación lleva su ancho y su largo libres, a cara de muro y dentro de ella", () => {
    const inner = interiorDims(m);
    expect(inner.every((d) => d.auto && d.inner)).toBe(true);
    const L = inner.map((d) => Math.round(Math.hypot(d.x2 - d.x1, d.y2 - d.y1) * 100) / 100).sort((a, b) => a - b);
    // dormitorio 5,815 x 3,815; baño 5,815 x 2,815; estar 3,815 x 6,75 (muros de 0,25 y tabiques de 0,12)
    expect(L).toEqual([2.82, 3.82, 3.82, 5.82, 5.82, 6.75]);
    // junto al muro de arriba y al de la izquierda, sin pisar el centro de la habitación
    const dorm = inner.filter((d) => d.x1 < 6 && d.y1 < 4 && d.y2 < 4);
    expect(dorm.some((d) => d.y1 === 0.125 + 0.45 && d.y2 === 0.125 + 0.45)).toBe(true);
    expect(dorm.some((d) => d.x1 === 0.125 + 0.45 && d.x2 === 0.125 + 0.45)).toBe(true);
  });

  it("las interiores se pueden quitar sin tocar las de fachada", () => {
    const ed = new Editor();
    const n = ed.model.dims.length;
    ed.setInnerDims(false);
    expect(ed.model.dims.length).toBe(n - 6);
    expect(ed.model.dims.some((d) => d.inner)).toBe(false);
    ed.setInnerDims(true);
    expect(ed.model.dims.length).toBe(n);
  });
});

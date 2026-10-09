import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { autoDims } from "../autodim";
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
    const own = ed.model.dims.length;
    ed.autoDimension();
    const n = ed.model.dims.length;
    expect(n).toBe(own + dims.length);
    ed.runCommand("AC");
    expect(ed.model.dims.length).toBe(n);
    ed.clearAutoDims();
    expect(ed.model.dims.length).toBe(own);
    ed.undo();
    expect(ed.model.dims.length).toBe(n);
  });
});

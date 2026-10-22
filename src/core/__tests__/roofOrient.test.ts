import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { framing } from "../framing";
import { roofAlongX, roofGeom, roofSlopes } from "../geometry";
import { emptyModel, sampleProject, type Roof } from "../model";
import { rotation, transformElements } from "../transform";

const roof = (o: Partial<Roof> = {}): Roof => ({ id: 1, x1: 0, y1: 0, x2: 10, y2: 6, kind: "gable", pitch: 45, overhang: 0.5, base: 2.7, thick: 0.15, ...o });

describe("orientación de la cubierta", () => {
  it("la cumbrera va en lo largo salvo que se elija otra dirección", () => {
    expect(roofAlongX(roof())).toBe(true);
    const g = roofGeom(roof({ dir: "y" })), [a, b] = g.ridges[0];
    expect(a.x).toBeCloseTo(5); expect(b.x).toBeCloseTo(5);
    expect(Math.abs(b.y - a.y)).toBeCloseTo(7);
    // girada, la media luz es la del lado largo: la cumbrera queda más alta
    expect(g.top).toBeCloseTo(2.7 + 5 + 0.15 * Math.SQRT2);
    // y los hastiales pasan a los muros de arriba y abajo
    expect(g.gables.flat().every((p) => p.y === 0 || p.y === 6)).toBe(true);
  });

  it("de un agua: un faldón que cae hacia el lado elegido, con muro piñón en el alto", () => {
    for (const [drain, low] of [[0, (p: { x: number; y: number }) => p.y], [1, (p: { x: number; y: number }) => -p.x], [2, (p: { x: number; y: number }) => -p.y], [3, (p: { x: number; y: number }) => p.x]] as const) {
      const g = roofGeom(roof({ kind: "shed", drain, pitch: 10 }));
      expect(g.faces).toHaveLength(1);
      expect(g.ridges).toHaveLength(0);
      // el punto más bajo del faldón está del lado de la caída
      const f = g.faces[0], zmin = Math.min(...f.map((q) => q.z));
      const lows = f.filter((q) => q.z < zmin + 1e-6);
      expect(lows).toHaveLength(2);
      expect(low(lows[0])).toBeCloseTo(low(lows[1]));
      expect(f.filter((q) => q.z > zmin + 1e-6).every((q) => low(q) > low(lows[0]))).toBe(true);
      // dos hastiales trapeciales y el muro alto
      expect(g.gables).toHaveLength(3);
      // la flecha de la planta apunta hacia el lado bajo
      const [[s, e]] = roofSlopes(roof({ kind: "shed", drain }));
      expect(low(e)).toBeLessThan(low(s));
    }
  });

  it("al girar la cubierta 90° la cumbrera y la caída giran con ella", () => {
    const m = emptyModel();
    m.roofs.push(roof({ dir: "x" }), roof({ id: 2, kind: "shed", drain: 2 }));
    transformElements(m, [{ type: "roof", id: 1 }, { type: "roof", id: 2 }], rotation({ x: 0, y: 0 }, 90), false);
    expect(m.roofs[0].dir).toBe("y");
    expect([1, 3]).toContain(m.roofs[1].drain);
  });

  it("al dibujar, G gira la cumbrera y en la de un agua pasa la caída al lado siguiente", () => {
    const ed = new Editor();
    ed.defaults.roofKind = "gable";
    ed.setTool("roof");
    ed.runCommand("G");
    expect(ed.defaults.roofDir).toBe("y");
    ed.runCommand("0,0"); ed.runCommand("10,6");
    const r = ed.model.roofs[ed.model.roofs.length - 1];
    expect(r.dir).toBe("y");
    ed.defaults.roofKind = "shed";
    ed.runCommand("G");
    expect(ed.defaults.roofDrain).toBe(3);
    expect(ed.roofOrient()).toEqual({ drain: 3 });
  });

  it("con cumbrera automática la dirección no salta al estirar el rectángulo hasta la otra esquina", () => {
    const ed = new Editor();
    ed.defaults.roofKind = "gable"; ed.defaults.roofDir = "auto";
    ed.setTool("roof");
    ed.runCommand("0,0");
    ed.mouse = { x: 6, y: -0.5, in: true };
    expect(ed.roofOrient()).toEqual({ dir: "x" });
    // ahora el lado vertical es más largo, pero la cumbrera sigue horizontal
    ed.mouse = { x: 6, y: -9, in: true };
    expect(ed.roofOrient()).toEqual({ dir: "x" });
    ed.runCommand("6,9");
    expect(ed.model.roofs[ed.model.roofs.length - 1].dir).toBe("x");
  });

  it("entramado de la de un agua: cabios de alero a alero, sin cumbrera ni tirantes", () => {
    const p = sampleProject(), r = p.levels[0].roofs[0];
    r.kind = "shed"; r.drain = 2; r.pitch = 10; delete r.dormers;
    const ms = framing(p);
    expect(ms.some((m) => m.kind === "ridge" || m.kind === "collar")).toBe(false);
    const rf = ms.filter((m) => m.kind === "rafter");
    expect(rf.length).toBeGreaterThan(5);
    // cada cabio baja hacia el lado de abajo (y mayor)
    for (const m of rf) { const [hi, lo] = m.a.y < m.b.y ? [m.a, m.b] : [m.b, m.a]; expect(hi.z).toBeGreaterThan(lo.z); }
    expect(ms.filter((m) => m.kind === "fascia")).toHaveLength(2);
  });
});

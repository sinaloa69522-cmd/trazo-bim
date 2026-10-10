import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { DEFAULT_SNAPS, objectSnap, resolveSnap, snapGeometry, type SnapOpts } from "../../editor/snaps";
import { emptyModel } from "../model";

/** Dos muros en L de 0,20: (0,0)-(4,0) y (4,0)-(4,3), y una línea de (0,2) a (6,2). */
function lModel() {
  const m = emptyModel();
  m.walls.push({ id: 1, x1: 0, y1: 0, x2: 4, y2: 0, thick: 0.2, height: 2.7 } as never, { id: 2, x1: 4, y1: 0, x2: 4, y2: 3, thick: 0.2, height: 2.7 } as never);
  m.lines.push({ id: 3, x1: 0, y1: 2, x2: 6, y2: 2 } as never);
  m.columns.push({ id: 4, x: 8, y: 8, w: 0.3, d: 0.3 });
  return m;
}
const base = (o: Partial<SnapOpts> = {}): SnapOpts => ({
  tol: 0.2, osnap: true, modes: new Set(DEFAULT_SNAPS), from: null, ortho: false, polar: false, polarInc: 45,
  constrain: true, otrack: true, tracked: [], round: (v) => Math.round(v * 10) / 10, ...o,
});

describe("referencias a objetos", () => {
  const geo = snapGeometry(lModel());
  it("punto final, punto medio, centro de columna e intersección", () => {
    expect(objectSnap(geo, { x: 3.95, y: 0.05 }, base())).toMatchObject({ x: 4, y: 0, kind: "end" });
    expect(objectSnap(geo, { x: 2.05, y: 0.03 }, base())).toMatchObject({ x: 2, y: 0, kind: "mid" });
    expect(objectSnap(geo, { x: 8.03, y: 8.02 }, base())).toMatchObject({ x: 8, y: 8, kind: "cen" });
    // la línea cruza el muro vertical por su eje y por sus dos caras
    const i = objectSnap(geo, { x: 3.92, y: 2.04 }, base());
    expect(i).toMatchObject({ kind: "int", y: 2 });
    expect(i!.x).toBeCloseTo(3.9);
  });
  it("las caras de los muros se cortan en la esquina exterior", () => {
    const r = objectSnap(geo, { x: 4.07, y: -0.08 }, base());
    expect(r!.kind).toBe("int");
    expect(r!.x).toBeCloseTo(4.1); expect(r!.y).toBeCloseTo(-0.1);
  });
  it("perpendicular desde el último punto y cercano", () => {
    const r = objectSnap(geo, { x: 4.6, y: 2.1 }, base({ from: { x: 3, y: 5 }, modes: new Set(["perp"]) }));
    expect(r).toMatchObject({ x: 3, y: 2, kind: "perp" });
    const n = objectSnap(geo, { x: 5.23, y: 2.1 }, base({ modes: new Set(["near"]) }));
    expect(n).toMatchObject({ x: 5.23, y: 2, kind: "near" });
  });
  it("sin modos activos no engancha", () => {
    expect(objectSnap(geo, { x: 3.95, y: 0.05 }, base({ modes: new Set() }))).toBeNull();
  });
});

describe("rastreo polar y de referencias", () => {
  const geo = { segs: [], pts: [] };
  it("polar: se pega al rayo de 45° y redondea la distancia", () => {
    const r = resolveSnap(geo, 2.2, 2.05, base({ from: { x: 0, y: 0 }, polar: true }));
    expect(r.x).toBeCloseTo(r.y);
    expect(Math.hypot(r.x, r.y)).toBeCloseTo(3.0);
    expect(r.guides).toHaveLength(1);
    expect(r.tip).toMatch(/Polar 3\.00 ∠315°/);
    // a 30° también
    const s = resolveSnap(geo, 2.6, -1.45, base({ from: { x: 0, y: 0 }, polar: true, polarInc: 30 }));
    expect(s.tip).toMatch(/∠30°/);
  });
  it("rastreo: se alinea con un punto adquirido y cruza dos alineaciones", () => {
    const tracked = [{ x: 5, y: 0 }, { x: 0, y: 3 }];
    const a = resolveSnap(geo, 5.05, 1.33, base({ tracked }));
    expect(a).toMatchObject({ x: 5, y: 1.3, tip: "Rastreo" });
    const b = resolveSnap(geo, 5.08, 2.95, base({ tracked }));
    expect(b).toMatchObject({ x: 5, y: 3 });
    expect(b.guides).toHaveLength(2);
    // con ortogonal, el rastreo fija el punto sobre el eje obligado
    const c = resolveSnap(geo, 5.1, 0.1, base({ tracked: [{ x: 5, y: 7 }], from: { x: 0, y: 0 }, ortho: true }));
    expect(c).toMatchObject({ x: 5, y: 0 });
  });
  it("sin forzcursor el punto no se redondea", () => {
    expect(resolveSnap(geo, 1.234, 5.678, base({ round: null }))).toMatchObject({ x: 1.234, y: 5.678 });
    expect(resolveSnap(geo, 1.234, 5.678, base())).toMatchObject({ x: 1.2, y: 5.7 });
  });
});

describe("ayudas de dibujo en el editor", () => {
  it("POLAR y ORTO se excluyen y el ángulo se cambia por comando", () => {
    const ed = new Editor();
    expect(ed.ortho).toBe(true);
    ed.runCommand("POLAR");
    expect(ed.polar).toBe(true); expect(ed.ortho).toBe(false);
    ed.runCommand("POLAR 30");
    expect(ed.polarInc).toBe(30);
    ed.runCommand("ORTO");
    expect(ed.polar).toBe(false);
    ed.runCommand("FORZC"); expect(ed.gridSnap).toBe(false);
    ed.runCommand("REJILLA"); expect(ed.showGrid).toBe(false);
    ed.runCommand("RASTREO"); expect(ed.otrack).toBe(false);
  });
  it("coordenadas polares y referencia de un solo uso", () => {
    const ed = new Editor();
    ed.clear();
    ed.setTool("line");
    ed.runCommand("0;0");
    ed.runCommand("@2<90");
    const l = ed.model.lines[0];
    expect(l.x2).toBeCloseTo(0); expect(l.y2).toBeCloseTo(-2);
    ed.runCommand("@3<0");
    ed.runCommand("MED");
    expect(ed.oneShot).toBe("mid");
    ed.toggleOsnap();
    // con REFENT apagado, la referencia de un solo uso sigue valiendo
    const p = ed.snapPoint(1.42, -1.97);
    expect(p).toMatchObject({ x: 1.5, y: -2, kind: "mid" });
  });
});

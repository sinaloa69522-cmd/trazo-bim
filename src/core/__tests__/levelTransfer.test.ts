import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { emptyModel } from "../model";
import { transferElements } from "../transform";

describe("pasar elementos entre niveles", () => {
  it("copia un muro con sus huecos y mueve un mueble", () => {
    const a = emptyModel(), b = emptyModel();
    a.walls.push({ id: 1, type: "x", x1: 0, y1: 0, x2: 4, y2: 0, thick: 0.15, height: 2.6, attach: false });
    a.openings.push({ id: 2, wallId: 1, t: 0.5, kind: "window", width: 1.2, height: 1.2, sill: 0.9, flip: false });
    a.furniture.push({ id: 3, kind: "bed2", x: 2, y: 2, rot: 0 } as never);
    a.nid = 4;
    const r = transferElements(a, b, [{ type: "wall", id: 1 }, { type: "furniture", id: 3 }], false);
    expect(r.length).toBe(2);
    expect(b.walls.length).toBe(1);
    expect(b.openings[0].wallId).toBe(b.walls[0].id);
    expect(a.walls.length).toBe(1);
    transferElements(a, b, [{ type: "furniture", id: 3 }], true);
    expect(a.furniture.length).toBe(0);
    expect(b.furniture.length).toBe(2);
  });

  it("una ventana suelta pasa al muro que esté en el mismo sitio, aunque vaya al revés", () => {
    const a = emptyModel(), b = emptyModel();
    a.walls.push({ id: 1, type: "x", x1: 0, y1: 0, x2: 4, y2: 0, thick: 0.15, height: 2.6, attach: false });
    a.openings.push({ id: 2, wallId: 1, t: 0.25, kind: "window", width: 1, height: 1.2, sill: 0.9, flip: false });
    b.walls.push({ id: 7, type: "x", x1: 4, y1: 0, x2: 0, y2: 0, thick: 0.15, height: 2.6, attach: false });
    b.nid = 8;
    transferElements(a, b, [{ type: "opening", id: 2 }], false);
    expect(b.openings[0].wallId).toBe(7);
    expect(b.openings[0].t).toBeCloseTo(0.75);
    // sin muro que la reciba no pasa
    const c = emptyModel();
    expect(transferElements(a, c, [{ type: "opening", id: 2 }], false)).toEqual([]);
  });

  it("el editor mueve la selección a otro nivel y lo activa", () => {
    const ed = new Editor();
    ed.addLevel("struct");
    const up = ed.project.levels[1];
    expect(up.walls.length).toBe(ed.project.levels[0].walls.length);
    expect(up.furniture.length).toBe(0);
    ed.setActiveLevel(0);
    const w = ed.model.walls[0];
    ed.sels = [{ type: "wall", id: w.id }];
    const before = up.walls.length;
    ed.transferSel(1, true);
    expect(ed.active).toBe(1);
    expect(up.walls.length).toBe(before + 1);
    expect(ed.project.levels[0].walls.some((x) => x.id === w.id)).toBe(false);
  });
});

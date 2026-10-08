import { describe, expect, it } from "vitest";
import { toDxf } from "../dxf";
import { fits, pieces } from "../geometry";
import { emptyModel, normalizeModel, sampleModel } from "../model";
import { computeRooms } from "../rooms";
import { Editor } from "../../editor/Editor";

describe("geometría de muros", () => {
  it("corta los huecos en tramos macizos", () => {
    const m = sampleModel();
    const top = m.walls[0];
    const { solids, ops } = pieces(m, top);
    expect(ops).toHaveLength(2);
    expect(solids).toHaveLength(3);
    // las esquinas se prolongan medio espesor
    expect(solids[0][0]).toBeCloseTo(-0.125);
  });

  it("no deja insertar huecos solapados", () => {
    const m = sampleModel();
    const top = m.walls[0];
    expect(fits(m, top, 0.28, 1.0)).toBe(false);
    expect(fits(m, top, 0.55, 1.0)).toBe(true);
  });
});

describe("habitaciones", () => {
  it("calcula la superficie útil del dormitorio de ejemplo", () => {
    const m = sampleModel();
    const g = computeRooms(m)!;
    const dorm = g.rooms.get(m.rooms[0].id)!;
    expect(dorm.ok).toBe(true);
    // interior teórico: (6 - 0.125 - 0.06) x (4 - 0.125 - 0.06) = 22.17 m²; la rejilla de 5 cm da una aproximación
    expect(dorm.area).toBeGreaterThan(21);
    expect(dorm.area).toBeLessThan(22.5);
  });

  it("marca como abierto un espacio sin cerrar", () => {
    const m = emptyModel();
    m.walls.push({ id: 1, x1: 0, y1: 0, x2: 5, y2: 0, thick: 0.2, height: 2.7 });
    m.rooms.push({ id: 2, x: 2, y: 2, name: "Patio" });
    expect(computeRooms(m)!.rooms.get(2)!.ok).toBe(false);
  });
});

describe("DXF", () => {
  it("exporta entidades en sus capas", () => {
    const m = sampleModel();
    const dxf = toDxf(m, computeRooms(m));
    expect(dxf.startsWith("0\nSECTION\n2\nENTITIES")).toBe(true);
    expect(dxf.endsWith("0\nEOF")).toBe(true);
    for (const layer of ["A-MUROS", "A-PUERTAS", "A-VENTANAS", "A-COTAS", "A-HABITACIONES"]) expect(dxf).toContain(layer);
  });
});

describe("modelo", () => {
  it("acepta modelos guardados sin habitaciones", () => {
    expect(normalizeModel({ walls: [], openings: [], lines: [], dims: [], nid: 3 }).rooms).toEqual([]);
  });
});

describe("editor", () => {
  it("dibuja un muro tecleando la longitud", () => {
    const ed = new Editor();
    ed.clear();
    ed.view = { scale: 50, ox: 0, oy: 0 };
    ed.pointerDown(100, 100); // punto (2, 2)
    ed.pointerMove(400, 110); // dirección +X con ORTO
    ed.runCommand("4.5");
    const w = ed.model.walls[0];
    expect(w).toMatchObject({ x1: 2, y1: 2, y2: 2 });
    expect(w.x2).toBeCloseTo(6.5);
  });

  it("estira un muro y conserva la posición de sus ventanas", () => {
    const ed = new Editor();
    ed.view = { scale: 50, ox: 0, oy: 0 };
    const right = ed.model.walls[1]; // (10,0)-(10,7)
    const win = ed.model.openings.find((o) => o.wallId === right.id)!;
    ed.select({ type: "wall", id: right.id });
    ed.pointerDown(500, 175); // pinzamiento central (10, 3.5)
    ed.pointerMove(600, 175); // +2 m
    ed.pointerUp();
    expect(right.x1).toBeCloseTo(12);
    expect(ed.model.walls[0].x2).toBeCloseTo(12); // el muro unido lo sigue
    expect(win.t * 7).toBeCloseTo(3.5);
    ed.undo();
    expect(ed.model.walls[1].x1).toBeCloseTo(10);
  });

  it("copia un muro con sus huecos", () => {
    const ed = new Editor();
    const top = ed.model.walls[0];
    ed.select({ type: "wall", id: top.id });
    ed.setTool("copy");
    ed.commitPoint({ x: 0, y: 0 });
    ed.commitPoint({ x: 0, y: -3 });
    expect(ed.model.walls).toHaveLength(7);
    expect(ed.model.openings.filter((o) => o.wallId === ed.model.walls[6].id)).toHaveLength(2);
  });
});

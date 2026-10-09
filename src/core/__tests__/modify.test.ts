import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { extend, offset, trim } from "../modify";
import { emptyModel, sampleModel } from "../model";

describe("recortar", () => {
  it("quita el tramo de muro entre el tabique y la esquina y conserva la ventana del otro lado", () => {
    const m = sampleModel();
    const top = m.walls[0]; // (0,0)-(10,0), tabique en x = 6
    expect(trim(m, { type: "wall", id: top.id }, { x: 8, y: 0 })).toBe(true);
    expect(top).toMatchObject({ x1: 0, x2: 6 });
    const ops = m.openings.filter((o) => o.wallId === top.id);
    expect(ops).toHaveLength(1); // la ventana de x = 8 desapareció
    expect(ops[0].t * 6).toBeCloseTo(2.8); // la otra sigue en x = 2.8
  });

  it("divide en dos una línea cuando se recorta un tramo intermedio", () => {
    const m = sampleModel();
    m.lines.push({ id: 900, x1: -2, y1: 2, x2: 12, y2: 2 });
    expect(trim(m, { type: "line", id: 900 }, { x: 3, y: 2 })).toBe(true);
    const ls = m.lines.filter((l) => l.y1 === 2).map((l) => [l.x1, l.x2]).sort((a, b) => a[0] - b[0]);
    expect(ls).toEqual([[-2, 0], [6, 12]]);
  });

  it("no hace nada si nada corta el elemento", () => {
    const m = emptyModel();
    m.lines.push({ id: 1, x1: 0, y1: 0, x2: 5, y2: 0 });
    expect(trim(m, { type: "line", id: 1 }, { x: 2, y: 0 })).toBe(false);
    expect(m.lines[0].x2).toBe(5);
  });
});

describe("alargar", () => {
  it("lleva el extremo de una línea hasta el muro más cercano en su dirección", () => {
    const m = sampleModel();
    m.lines.push({ id: 900, x1: 2, y1: 2, x2: 4, y2: 2 });
    expect(extend(m, { type: "line", id: 900 }, { x: 3.9, y: 2 })).toBe(true);
    expect(m.lines.find((l) => l.id === 900)!.x2).toBeCloseTo(6);
    expect(extend(m, { type: "line", id: 900 }, { x: 2.1, y: 2 })).toBe(true);
    expect(m.lines.find((l) => l.id === 900)!.x1).toBeCloseTo(0);
  });

  it("al alargar el inicio de un muro sus huecos no se mueven", () => {
    const m = emptyModel();
    m.walls.push({ id: 1, x1: 0, y1: 0, x2: 0, y2: 10, thick: 0.2, height: 2.7, attach: true });
    m.walls.push({ id: 2, x1: 2, y1: 5, x2: 6, y2: 5, thick: 0.2, height: 2.7, attach: true });
    m.openings.push({ id: 3, wallId: 2, t: 0.5, kind: "window", width: 1, height: 1.2, sill: 0.9, flip: false });
    expect(extend(m, { type: "wall", id: 2 }, { x: 2.2, y: 5 })).toBe(true);
    expect(m.walls[1].x1).toBeCloseTo(0);
    expect(m.openings[0].t * 6).toBeCloseTo(4); // sigue centrada en x = 4
  });
});

describe("desfase", () => {
  it("crea una copia paralela hacia el lado indicado", () => {
    const m = emptyModel();
    m.nid = 10;
    m.lines.push({ id: 1, x1: 0, y1: 0, x2: 5, y2: 0 });
    const r = offset(m, { type: "line", id: 1 }, 1.5, { x: 2, y: 3 })!;
    expect(m.lines.find((l) => l.id === r.id)).toMatchObject({ x1: 0, y1: 1.5, x2: 5, y2: 1.5 });
    const r2 = offset(m, { type: "line", id: 1 }, 1.5, { x: 2, y: -3 })!;
    expect(m.lines.find((l) => l.id === r2.id)!.y1).toBeCloseTo(-1.5);
  });

  it("con el editor se teclea la distancia, se elige el muro y se pulsa el lado", () => {
    const ed = new Editor();
    ed.view = { scale: 50, ox: 0, oy: 0 };
    ed.setTool("offset");
    ed.runCommand("2,5");
    expect(ed.offsetDist).toBe(2.5);
    ed.pointerDown(250, 0); // muro superior en (5, 0)
    ed.pointerDown(250, -100); // lado de arriba (y = -2)
    const copy = ed.model.walls[ed.model.walls.length - 1];
    expect(copy).toMatchObject({ x1: 0, y1: -2.5, x2: 10, y2: -2.5 });
    expect(ed.model.openings.some((o) => o.wallId === copy.id)).toBe(false);
  });
});

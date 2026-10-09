import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { toDxf } from "../dxf";
import { parseDxf } from "../dxfImport";
import { sampleModel } from "../model";
import { computeRooms } from "../rooms";
import { reflection, transformElements } from "../transform";

describe("simetría", () => {
  it("refleja un muro respecto a un eje vertical y copia sus huecos", () => {
    const m = sampleModel();
    const bottom = m.walls[2]; // (10,7)-(0,7), con puerta y ventana
    const [copy] = transformElements(m, [{ type: "wall", id: bottom.id }], reflection({ x: 12, y: 0 }, { x: 12, y: 10 }), true);
    const w = m.walls.find((x) => x.id === copy.id)!;
    expect(w).toMatchObject({ x1: 14, y1: 7, x2: 24, y2: 7 });
    const door = m.openings.find((o) => o.wallId === w.id && o.kind === "door")!;
    expect(door.flip).toBe(true); // la puerta abre al lado reflejado
    expect(m.openings.filter((o) => o.wallId === w.id)).toHaveLength(2);
  });

  it("con el editor conserva los originales y selecciona las copias", () => {
    const ed = new Editor();
    const before = ed.model.walls.length;
    ed.sels = ed.model.walls.map((w) => ({ type: "wall" as const, id: w.id }));
    ed.setTool("mirror");
    ed.commitPoint({ x: 11, y: 0 });
    ed.commitPoint({ x: 11, y: 5 });
    expect(ed.model.walls).toHaveLength(before * 2);
    expect(ed.sels).toHaveLength(before);
    expect(ed.tool).toBe("select");
  });
});

describe("selección por ventana", () => {
  it("de izquierda a derecha solo toma lo que queda dentro", () => {
    const ed = new Editor();
    ed.selectBox({ x: -1, y: -1 }, { x: 6.5, y: 8 }, false); // abarca la mitad izquierda
    const walls = ed.sels.filter((s) => s.type === "wall").map((s) => s.id);
    // muro izquierdo (0,7)-(0,0), tabique (6,0)-(6,7) y tabique (0,4)-(6,4)
    expect(walls.sort()).toEqual([ed.model.walls[3].id, ed.model.walls[4].id, ed.model.walls[5].id].sort());
  });

  it("de derecha a izquierda también toma lo que cruza", () => {
    const ed = new Editor();
    ed.selectBox({ x: 6.5, y: 8 }, { x: -1, y: -1 }, false);
    // todos menos el muro derecho (x = 10), que queda fuera
    expect(ed.sels.filter((s) => s.type === "wall")).toHaveLength(5);
  });

  it("borra todo lo seleccionado de una vez y se puede deshacer", () => {
    const ed = new Editor();
    ed.selectBox({ x: 6.5, y: 8 }, { x: -1, y: -1 }, false);
    ed.deleteSel();
    expect(ed.model.walls).toHaveLength(1);
    expect(ed.model.openings.every((o) => o.wallId === ed.model.walls[0].id)).toBe(true);
    ed.undo();
    expect(ed.model.walls).toHaveLength(6);
  });
});

describe("importar DXF", () => {
  it("lee las líneas que exportamos (ida y vuelta)", () => {
    const m = sampleModel();
    const r = parseDxf(toDxf(m, computeRooms(m)));
    expect(r.segments.length).toBeGreaterThan(50);
    // los arcos de las puertas también se leen
    expect(r.skipped.ARC).toBeUndefined();
    expect(r.unitsLabel).toBe("m");
    // las coordenadas vuelven con el eje Y de la planta
    expect(r.segments.some((s) => s.a.y > 6.9 && s.a.y < 7.2)).toBe(true);
  });

  it("detecta milímetros y polilíneas cerradas", () => {
    const dxf = [
      "0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC",
      "0", "SECTION", "2", "ENTITIES",
      "0", "LWPOLYLINE", "8", "MUROS", "90", "4", "70", "1",
      "10", "0", "20", "0", "10", "5000", "20", "0", "10", "5000", "20", "3000", "10", "0", "20", "3000",
      "0", "ENDSEC", "0", "EOF",
    ].join("\n");
    const r = parseDxf(dxf);
    expect(r.unitsLabel).toBe("mm");
    expect(r.segments).toHaveLength(4);
    expect(r.segments[1].b).toEqual({ x: 5, y: -3 });
    expect(r.segments[0].layer).toBe("MUROS");
  });

  it("el editor importa, selecciona y convierte en muros", () => {
    const ed = new Editor();
    ed.clear();
    ed.importDxf(["0", "SECTION", "2", "ENTITIES", "0", "LINE", "8", "0", "10", "0", "20", "0", "11", "4", "21", "0", "0", "ENDSEC", "0", "EOF"].join("\n"), "plano.dxf");
    expect(ed.model.lines).toHaveLength(1);
    expect(ed.sels).toEqual([{ type: "line", id: ed.model.lines[0].id }]);
    ed.linesToWalls();
    expect(ed.model.lines).toHaveLength(0);
    expect(ed.model.walls).toHaveLength(1);
    expect(ed.model.walls[0]).toMatchObject({ x1: 0, x2: 4, thick: ed.defaults.thick });
  });
});

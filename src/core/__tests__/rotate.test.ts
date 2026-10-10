import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { emptyModel } from "../model";
import { rotation, scaling, screenAngle, transformElements } from "../transform";

describe("girar, escala y matriz", () => {
  it("gira 90° en sentido antihorario tal como se ve en pantalla", () => {
    const r = rotation({ x: 0, y: 0 }, 90);
    const p = r.map({ x: 1, y: 0 });
    expect(p.x).toBeCloseTo(0); expect(p.y).toBeCloseTo(-1); // arriba en pantalla (y del modelo hacia abajo)
    expect(screenAngle({ x: 0, y: 0 }, { x: 0, y: -1 })).toBeCloseTo(90);
  });

  it("el deck girado conserva su tamaño y sus escalones cambian de lado", () => {
    const m = emptyModel();
    m.decks.push({ id: 1, x1: 0, y1: 0, x2: 4, y2: 2, kind: "wood", height: 0.6, rail: "none", stairSide: 2 } as never);
    transformElements(m, [{ type: "deck", id: 1 }], rotation({ x: 0, y: 0 }, 90), false);
    const d = m.decks[0];
    expect(d.x2 - d.x1).toBeCloseTo(2); expect(d.y2 - d.y1).toBeCloseTo(4);
    expect(d.stairSide).toBe(1); // abajo → derecha al girar 90° antihorario
  });

  it("el texto gira con el dibujo y la escala cambia las longitudes", () => {
    const m = emptyModel();
    m.texts.push({ id: 1, x: 1, y: 0, text: "A", size: 0.25, rot: 0 });
    m.lines.push({ id: 2, x1: 0, y1: 0, x2: 2, y2: 0 });
    transformElements(m, [{ type: "text", id: 1 }], rotation({ x: 0, y: 0 }, 45), false);
    expect(m.texts[0].rot).toBe(45);
    transformElements(m, [{ type: "line", id: 2 }], scaling({ x: 0, y: 0 }, 2.5), false);
    expect(m.lines[0].x2).toBeCloseTo(5);
  });

  it("desde la línea de comandos: RO con ángulo, ESC con factor y MA con número de elementos", () => {
    const ed = new Editor();
    ed.clear();
    ed.model.lines.push({ id: 50, x1: 0, y1: 0, x2: 2, y2: 0 });
    // sin selección la herramienta queda pendiente hasta Enter
    ed.runCommand("RO");
    expect(ed.tool).toBe("select");
    expect(ed.pendingModify).toBe("rotate");
    ed.sels = [{ type: "line", id: 50 }];
    ed.runCommand("");
    expect(ed.tool).toBe("rotate");
    ed.commitPoint({ x: 0, y: 0 });
    ed.runCommand("90");
    const l = ed.model.lines.find((x) => x.id === 50)!;
    expect(l.x2).toBeCloseTo(0); expect(l.y2).toBeCloseTo(-2);

    ed.runCommand("ESC");
    expect(ed.tool).toBe("scale");
    ed.commitPoint({ x: 0, y: 0 });
    ed.runCommand("0.5");
    expect(ed.model.lines.find((x) => x.id === 50)!.y2).toBeCloseTo(-1);

    ed.runCommand("MA");
    ed.runCommand("4");
    ed.commitPoint({ x: 0, y: 0 });
    ed.commitPoint({ x: 1, y: 0 });
    const xs = ed.model.lines.map((x) => Math.round(x.x1 * 100) / 100).sort();
    expect(xs).toEqual([0, 1, 2, 3]);
  });
});

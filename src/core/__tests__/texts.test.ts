import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { toDxf } from "../dxf";
import { textBox } from "../geometry";
import { normalizeProject } from "../model";
import { reflection, transformElements, translation } from "../transform";

describe("textos", () => {
  it("clic y escribir en la línea de comandos crea el texto, con mayúsculas y espacios", () => {
    const ed = new Editor();
    ed.runCommand("TX");
    ed.commitPoint({ x: 1, y: 9 });
    expect(ed.prompt()).toMatch(/Escribe el texto/);
    ed.runCommand("Acceso principal");
    const t = ed.model.texts[0];
    expect(t).toMatchObject({ x: 1, y: 9, text: "Acceso principal", size: 0.25, rot: 0 });
    // un texto que coincide con un comando no lo ejecuta
    ed.commitPoint({ x: 1, y: 10 }); ed.runCommand("M");
    expect(ed.model.texts[1].text).toBe("M");
    expect(ed.tool).toBe("text");
    // Intro vacío o Esc cancelan
    ed.commitPoint({ x: 1, y: 11 }); ed.runCommand("");
    ed.commitPoint({ x: 1, y: 11 }); ed.escape();
    expect(ed.model.texts).toHaveLength(2);
    ed.undo();
    expect(ed.model.texts).toHaveLength(1);
  });

  it("se selecciona por su rectángulo y se exporta al DXF", () => {
    const ed = new Editor();
    ed.setTool("text"); ed.commitPoint({ x: 2, y: 9 }); ed.runCommand("Nota");
    ed.setTool("select");
    expect(ed.pick(2.3, 8.9)).toEqual({ type: "text", id: ed.model.texts[0].id });
    expect(toDxf(ed.model, null)).toMatch(/TEXT\n8\nA-ANOTACION\n10\n2\.0000\n20\n-9\.0000[\s\S]*\nNota\n50\n0\.00/);
  });

  it("al girarlo el rectángulo gira en sentido antihorario", () => {
    const b = textBox({ x: 0, y: 0, text: "AB", size: 1, rot: 90 });
    // la línea base va hacia arriba en la planta (y decreciente)
    expect(b[1].x).toBeCloseTo(0.25); expect(b[1].y).toBeCloseTo(-1.2);
  });

  it("mover y reflejar solo cambian el punto de inserción", () => {
    const ed = new Editor();
    ed.setTool("text"); ed.commitPoint({ x: 2, y: 9 }); ed.runCommand("Nota");
    const m = ed.model, t = m.texts[0];
    transformElements(m, [{ type: "text", id: t.id }], translation(1, 1), false);
    expect(t).toMatchObject({ x: 3, y: 10, rot: 0 });
    const [c] = transformElements(m, [{ type: "text", id: t.id }], reflection({ x: 5, y: 0 }, { x: 5, y: 1 }), true);
    expect(m.texts.find((x) => x.id === c.id)).toMatchObject({ x: 7, y: 10, text: "Nota", rot: 0 });
    expect(normalizeProject({ levels: [{ name: "PB", elev: 0 }] }).levels[0].texts).toEqual([]);
  });
});

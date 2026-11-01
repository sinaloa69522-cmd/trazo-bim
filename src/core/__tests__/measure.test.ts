import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";

describe("medir", () => {
  it("da la distancia entre dos puntos sin crear nada en el dibujo", () => {
    const ed = new Editor(), before = JSON.stringify(ed.model);
    ed.runCommand("MEDIR");
    expect(ed.tool).toBe("measure");
    ed.commitPoint({ x: 0, y: 0 }); ed.commitPoint({ x: 3, y: 4 });
    expect(ed.message).toMatch(/Distancia 5/);
    ed.runCommand("");
    expect(ed.measured).toEqual({ pts: [{ x: 0, y: 0 }, { x: 3, y: 4 }], closed: false });
    expect(JSON.stringify(ed.model)).toBe(before);
  });

  it("suma tramos y, cerrada en el primer punto, da área y perímetro", () => {
    const ed = new Editor();
    ed.setTool("measure");
    for (const p of [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }]) ed.commitPoint(p);
    expect(ed.message).toMatch(/total 7/);
    ed.commitPoint({ x: 0, y: 0 });
    expect(ed.measured?.closed).toBe(true);
    expect(ed.message).toMatch(/Área 6/);
    expect(ed.message).toMatch(/perímetro 12/);
    // Esc borra la medición y un clic nuevo empieza otra
    ed.escape();
    expect(ed.measured).toBeNull();
    expect(ed.tool).toBe("measure");
  });
});

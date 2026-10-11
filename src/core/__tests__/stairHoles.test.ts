import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";

/** Vivienda de ejemplo con una escalera recta en el estar. */
function withStair() {
  const ed = new Editor();
  ed.setTool("stair"); ed.runCommand("7;-1"); ed.runCommand("7;-5");
  return ed;
}

describe("hueco en losa para la escalera", () => {
  it("la planta nueva lleva su losa de entrepiso con el hueco sobre la escalera", () => {
    const ed = withStair();
    ed.addLevel(false);
    expect(ed.model.slabs).toHaveLength(1);
    expect(ed.model.slabs[0].holes).toHaveLength(1);
  });
  it("dibujado desde la planta de la escalera, el hueco va a la losa de arriba y no a la del piso", () => {
    const ed = withStair();
    ed.addLevel(false);
    ed.model.slabs[0].holes = [];
    ed.setActiveLevel(0);
    ed.setTool("hole"); ed.runCommand("6.4;-0.8"); ed.runCommand("7.8;-5.2");
    expect(ed.project.levels[1].slabs[0].holes).toHaveLength(1);
    expect(ed.project.levels[0].slabs[0].holes).toHaveLength(0);
  });
  it("sin nivel de arriba, el hueco se abre en la azotea", () => {
    const ed = withStair();
    ed.model.roofs[0].kind = "flat";
    ed.setTool("hole"); ed.runCommand("6.4;-0.8"); ed.runCommand("7.8;-5.2");
    expect(ed.model.roofs[0].holes).toHaveLength(1);
    expect(ed.model.slabs[0].holes).toHaveLength(0);
  });
  it("en un nivel sin losa explica qué falta", () => {
    const ed = new Editor();
    ed.addLevel(false);
    ed.model.slabs = [];
    ed.setTool("hole"); ed.runCommand("2;-2"); ed.runCommand("3;-3");
    expect(ed.message).toMatch(/no tiene losa/);
  });
});

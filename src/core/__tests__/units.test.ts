import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { toDxf } from "../dxf";
import { parseDxf } from "../dxfImport";
import { stairSteps } from "../geometry";
import { normalizeProject } from "../model";
import { feetInches, fmtArea, fmtDim, fmtLen, FT, IN, parseLen, scaleLabel, setUnitSystem } from "../units";

afterEach(() => setUnitSystem("metric"));

describe("pies y pulgadas", () => {
  it("escribe medidas como en los planos de EE.UU.", () => {
    expect(feetInches(12 * FT + 6 * IN)).toBe(`12'-6"`);
    expect(feetInches(10 * FT)).toBe(`10'-0"`);
    expect(feetInches(4.5 * IN)).toBe(`4 1/2"`);
    expect(feetInches(3 * FT + 0.25 * IN)).toBe(`3'-0 1/4"`);
    expect(feetInches(11 * IN + 15.95 / 16 * IN)).toBe(`1'-0"`);
    expect(fmtDim(14 * FT + 9.1 * IN, "imperial")).toBe(`14'-9"`);
    expect(fmtArea(12.5, "imperial")).toBe("135 sq ft");
    expect(fmtArea(150, "imperial")).toBe("1,615 sq ft");
    expect(fmtLen(2.5)).toBe("2.50 m");
  });

  it("lee lo que se teclea", () => {
    const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);
    close(parseLen(`12'6"`, "imperial"), 12 * FT + 6 * IN);
    close(parseLen(`12'-6 1/2"`, "imperial"), 12 * FT + 6.5 * IN);
    close(parseLen(`12' 6"`, "imperial"), 12 * FT + 6 * IN);
    close(parseLen(`12ft 6in`, "imperial"), 12 * FT + 6 * IN);
    close(parseLen(`6"`, "imperial"), 6 * IN);
    close(parseLen(`3/4"`, "imperial"), 0.75 * IN);
    close(parseLen(`12'`, "imperial"), 12 * FT);
    close(parseLen("12", "imperial"), 12 * FT);
    close(parseLen("12.5", "imperial"), 12.5 * FT);
    close(parseLen("-3", "imperial"), -3 * FT);
    close(parseLen("2.5"), 2.5);
    close(parseLen("2,5"), 2.5);
    close(parseLen("30cm"), 0.3);
    close(parseLen("3m", "imperial"), 3);
    close(parseLen(`10'`), 10 * FT);
    expect(parseLen("hola")).toBeNaN();
    expect(parseLen("")).toBeNaN();
    expect(parseLen("M")).toBeNaN();
  });

  it("rotula las escalas de arquitectura", () => {
    expect(scaleLabel(48, "imperial")).toBe(`1/4" = 1'-0"`);
    expect(scaleLabel(100)).toBe("1:100");
  });
});

describe("proyecto en unidades de EE.UU.", () => {
  it("cambia unidades, medidas por defecto y se guarda", () => {
    const ed = new Editor();
    ed.setUnits("imperial");
    expect(ed.project.units).toBe("imperial");
    expect(ed.defaults.wallType).toBe("us-2x6");
    expect(ed.defaults.doorW).toBeCloseTo(3 * FT, 6);
    expect(ed.defaults.doorH).toBeCloseTo(80 * IN, 6);
    expect(ed.prompt()).toBeTruthy();
    const back = normalizeProject(JSON.parse(JSON.stringify(ed.project)));
    expect(back.units).toBe("imperial");
    ed.undo();
    expect(ed.project.units).toBeUndefined();
    expect(fmtLen(1)).toBe("1.00 m");
  });

  it("dibuja un muro tecleando pies y pulgadas y coordenadas", () => {
    const ed = new Editor();
    ed.clear();
    ed.setUnits("imperial");
    ed.setTool("wall");
    ed.runCommand("0;0");
    ed.pointerMove(9999, 0);
    ed.mouse = { x: 100, y: 0, in: true }; ed.snap = null;
    ed.runCommand(`12'6"`);
    ed.runCommand(`@0;-10'`);
    const [a, b] = ed.model.walls;
    expect(Math.hypot(a.x2 - a.x1, a.y2 - a.y1)).toBeCloseTo(12 * FT + 6 * IN, 6);
    expect(b.y2 - b.y1).toBeCloseTo(10 * FT, 6);
    expect(a.thick).toBeCloseTo(6.5 * IN, 6);
    expect(ed.message).toContain(`10'-0"`);
  });

  it("exporta el DXF en pulgadas y se vuelve a leer en metros", () => {
    const ed = new Editor();
    ed.clear();
    ed.setUnits("imperial");
    ed.edit(() => { ed.model.lines.push({ id: 900, x1: 0, y1: 0, x2: 10 * FT, y2: 0 }); });
    const dxf = toDxf(ed.model, ed.rooms);
    expect(dxf).toContain("$INSUNITS\n70\n1");
    expect(dxf).toContain("120.0000");
    const r = parseDxf(dxf);
    const L = Math.max(...r.segments.map((s) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y)));
    expect(L).toBeCloseTo(10 * FT, 4);
  });

  it("las escaleras buscan contrahuellas de 7 1/2\"", () => {
    setUnitSystem("imperial");
    const k = stairSteps({ id: 1, x1: 0, y1: 0, x2: 4, y2: 0, width: 1, height: 10 * FT });
    expect(k.riser).toBeLessThanOrEqual(7.75 * IN);
    expect(k.n).toBe(16);
  });
});

describe("cotas de nivel", () => {
  it("siempre llevan pies en imperial", async () => {
    const { fmtElev } = await import("../units");
    expect(fmtElev(0, "imperial")).toBe(`+0'-0"`);
    expect(fmtElev(10 * FT, "imperial")).toBe(`+10'-0"`);
    expect(fmtElev(-6 * IN, "imperial")).toBe(`-0'-6"`);
    expect(fmtElev(3)).toBe("+3.00");
  });
});

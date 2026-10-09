import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { toDxf } from "../dxf";
import { elevation } from "../elevation";
import { toIfc } from "../ifc";
import { autoRoute, mepDef, runLength, sanitaryPoints } from "../mep";
import { normalizeModel, sampleProject } from "../model";
import { circuitSchedule, mepSchedule, runSchedule, sanitarySchedule } from "../schedules";
import { transformElements, translation } from "../transform";

const count = (text: string, t: string) => (text.match(new RegExp(`=${t}\\(`, "g")) ?? []).length;

describe("instalaciones", () => {
  it("la vivienda de ejemplo trae electricidad y plomería con sus recorridos", () => {
    const m = sampleProject().levels[0];
    expect(m.fixtures.filter((f) => mepDef(f.kind).disc === "elec").length).toBeGreaterThan(10);
    expect(m.fixtures.some((f) => f.kind === "toma-ac")).toBe(true);
    expect(new Set(m.runs.map((r) => r.system))).toEqual(new Set(["elec", "af", "ac", "san"]));
  });

  it("un enchufe se pega a la cara del muro y mira a la habitación", () => {
    const ed = new Editor();
    ed.pickDiscipline("elec");
    expect(ed.tool).toBe("fixture");
    expect(ed.defaults.mepKind).toBe("enchufe");
    // junto al muro norte (y = 0, 25 cm), por dentro
    expect(ed.fixtureCandidate({ x: 2.03, y: 0.4 })).toEqual({ x: 2.05, y: 0.195, rot: 0 });
    // junto al muro oeste (x = 0), por dentro: el frente mira a +x
    expect(ed.fixtureCandidate({ x: 0.3, y: 2.6 })).toEqual({ x: 0.195, y: 2.6, rot: 270 });
    // un punto de luz no se pega a nada
    ed.pickFixture("luz");
    expect(ed.fixtureCandidate({ x: 0.3, y: 2.6 })).toEqual({ x: 0.3, y: 2.6, rot: 0 });
  });

  it("los enchufes del baño van al circuito C5", () => {
    const ed = new Editor();
    ed.pickFixture("enchufe");
    ed.commitPoint({ x: 1.5, y: 4.3 });
    ed.commitPoint({ x: 1.5, y: 3.7 });
    const [bath, bed] = ed.model.fixtures.slice(-2);
    expect(bath.circuit).toBe("C5");
    expect(bed.circuit).toBe("C2");
    expect(bath.h).toBeCloseTo(0.3);
  });

  it("dibuja una tubería por puntos y la termina con Enter", () => {
    const ed = new Editor();
    const n = ed.model.runs.length;
    ed.pickSystem("san");
    ed.commitPoint({ x: 1, y: 5 }); ed.commitPoint({ x: 3, y: 5 });
    ed.runCommand("1.5");
    ed.runCommand("");
    const r = ed.model.runs[n];
    expect(ed.model.runs.length).toBe(n + 1);
    expect(r.system).toBe("san");
    expect(runLength(r)).toBeCloseTo(2 + 1.5);
    // Esc con un solo punto no crea nada
    ed.commitPoint({ x: 1, y: 1 }); ed.escape();
    expect(ed.model.runs.length).toBe(n + 1);
  });

  it("traza un circuito por cada C desde el cuadro y cada desagüe a la bajante más próxima", () => {
    const m = sampleProject().levels[0];
    const elec = autoRoute(m.fixtures, "elec"), board = m.fixtures.find((f) => f.kind === "cuadro")!;
    const circuits = new Set(m.fixtures.filter((f) => f.circuit).map((f) => f.circuit));
    expect(elec.length).toBe(circuits.size);
    for (const r of elec) expect(r.pts[0]).toEqual({ x: board.x, y: board.y });
    // los tramos son siempre horizontales o verticales
    for (const r of elec) for (let i = 1; i < r.pts.length; i++) expect(r.pts[i].x === r.pts[i - 1].x || r.pts[i].y === r.pts[i - 1].y).toBe(true);
    const san = autoRoute(m.fixtures, "plum").filter((r) => r.system === "san");
    expect(san.length).toBe(m.fixtures.filter((f) => f.kind === "desague" || f.kind === "sumidero").length);
    // el fregadero de la cocina desagua en la bajante de la cocina
    const sinkDrain = sanitaryPoints(m.furniture.find((f) => f.kind === "kitchen")!).find((q) => q.kind === "desague")!;
    const toKitchen = san.find((r) => Math.hypot(r.pts[0].x - sinkDrain.x, r.pts[0].y - sinkDrain.y) < 1e-6)!;
    expect(toKitchen.pts[toKitchen.pts.length - 1]).toEqual({ x: 6.35, y: 0.35 });
  });

  it("coloca las tomas de los aparatos sanitarios una sola vez", () => {
    const ed = new Editor();
    ed.model.fixtures = [];
    ed.placeSanitaryPoints();
    const n = ed.model.fixtures.length;
    // inodoro 2, lavabo 3, bañera 3, cocina 3
    expect(n).toBe(11);
    ed.placeSanitaryPoints();
    expect(ed.model.fixtures.length).toBe(n);
  });

  it("pone un punto de luz por habitación y traza de nuevo los circuitos", () => {
    const ed = new Editor();
    ed.model.fixtures = ed.model.fixtures.filter((f) => f.kind !== "luz");
    ed.placeRoomLights();
    expect(ed.model.fixtures.filter((f) => f.kind === "luz").length).toBe(3);
    ed.routeDiscipline("elec");
    const elecRuns = ed.model.runs.filter((r) => r.system === "elec");
    expect(elecRuns.length).toBe(new Set(ed.model.fixtures.filter((f) => f.circuit).map((f) => f.circuit)).size);
    // la plomería no se toca
    expect(ed.model.runs.some((r) => r.system === "af")).toBe(true);
  });

  it("mediciones: leyenda, circuitos, metros de tubería y aparatos", () => {
    const p = sampleProject();
    const legend = mepSchedule(p, "elec", 0);
    expect(legend.find((r) => r.kind === "luz")!.count).toBe(4);
    const cs = circuitSchedule(p, 0);
    expect(cs.map((c) => c.circuit)).toEqual(["C1", "C2", "C3", "C4", "C5"]);
    expect(cs.every((c) => c.length > 0)).toBe(true);
    const runs = runSchedule(p, "plum", 0);
    expect(runs.map((r) => r.system)).toEqual(["af", "ac", "san"]);
    expect(sanitarySchedule(p, 0).map((r) => r.label)).toEqual(["Inodoro", "Lavabo", "Bañera", "Encimera de cocina"]);
  });

  it("se mueven, se copian y se borran como el resto de elementos", () => {
    const ed = new Editor(), m = ed.model, f = m.fixtures[0], r = m.runs[0];
    const x0 = f.x, p0 = { ...r.pts[0] };
    transformElements(m, [{ type: "fixture", id: f.id }, { type: "run", id: r.id }], translation(1, 2), false);
    expect(f.x).toBeCloseTo(x0 + 1);
    expect(r.pts[0]).toEqual({ x: p0.x + 1, y: p0.y + 2 });
    ed.sels = [{ type: "fixture", id: f.id }, { type: "run", id: r.id }];
    ed.deleteSel();
    expect(m.fixtures.includes(f) || m.runs.includes(r)).toBe(false);
  });

  it("los modelos guardados antes no traen instalaciones", () => {
    const m = normalizeModel({ walls: [] });
    expect(m.fixtures).toEqual([]);
    expect(m.runs).toEqual([]);
  });

  it("se exportan al IFC como elementos de instalaciones agrupados por red, y al DXF en sus capas", () => {
    const p = sampleProject(), m = p.levels[0], text = toIfc(p);
    expect(count(text, "IFCLIGHTFIXTURE")).toBe(m.fixtures.filter((f) => f.kind === "luz" || f.kind === "aplique").length);
    expect(count(text, "IFCOUTLET")).toBe(m.fixtures.filter((f) => f.kind.startsWith("enchufe")).length);
    expect(count(text, "IFCELECTRICDISTRIBUTIONBOARD")).toBe(1);
    expect(count(text, "IFCDISTRIBUTIONSYSTEM")).toBe(4);
    expect(text).toContain(".DOMESTICHOTWATER.");
    expect(count(text, "IFCPIPESEGMENT")).toBeGreaterThan(5);
    const dxf = toDxf(m, null);
    for (const l of ["E-ELECTRICIDAD", "P-FONTANERIA", "P-AGUA-FRIA", "P-AGUA-CALIENTE", "P-SANEAMIENTO"]) expect(dxf).toContain(l);
  });
});

describe("fachadas", () => {
  it("las caras de los muros llevan el acabado de su tipo y los faldones la teja", () => {
    const e = elevation(sampleProject(), "S");
    const mats = new Set(e.faces.filter((f) => f.mat).map((f) => f.mat!.name));
    expect(mats.has("Ladrillo cerámico")).toBe(true);
    expect(mats.has("Teja cerámica")).toBe(true);
    // las carpinterías no llevan acabado
    expect(e.faces.filter((f) => f.kind === "glass").every((f) => !f.mat)).toBe(true);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { permitSet } from "../../ui/SheetView";
import { anchorBolts, ceilingJoist, floorJoist, footings, headers, headerSize, hvac, joistBays, rafterSize, roofFraming, site, wallBox } from "../permit";
import { FT, IN, setUnitSystem } from "../units";

afterEach(() => setUnitSystem("metric"));

describe("juego de permiso para EE.UU.", () => {
  it("predimensiona con las tablas del IRC", () => {
    expect(floorJoist(12 * FT)).toBe(`2x8 @ 16" O.C.`);
    expect(floorJoist(30 * FT)).toMatch(/TJI/);
    expect(ceilingJoist(12 * FT)).toBe(`2x4 @ 16" O.C.`);
    expect(rafterSize(14 * FT)).toBe(`2x8 @ 24" O.C.`);
    expect(headerSize(3 * FT)).toBe("(2) 2x6");
    expect(headerSize(6 * FT)).toBe("(2) 2x10");
    expect(headerSize(10 * FT)).toMatch(/LVL/);
  });

  it("cimentación: zapata corrida F1 bajo muros exteriores y anclas a 6' como máximo", () => {
    const ed = new Editor();
    const m = ed.model, ext = m.walls.filter((w) => w.thick >= 0.15);
    const f = footings(m);
    expect(f.filter((x) => x.mark === "F1").length).toBe(ext.length);
    const bolts = anchorBolts(m);
    expect(bolts.length).toBeGreaterThanOrEqual(ext.length * 2);
    for (const w of ext) {
      const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
      const on = bolts.filter((p) => Math.abs((w.x2 - w.x1) * (p.y - w.y1) - (w.y2 - w.y1) * (p.x - w.x1)) / L < 1e-6);
      expect(on.length).toBeGreaterThanOrEqual(Math.ceil((L - 24 * IN) / (6 * FT)) + 1);
    }
  });

  it("viguetas a 16\" por la luz corta de cada habitación y dinteles con marca", () => {
    const ed = new Editor();
    const bays = joistBays(ed.model, "floor");
    expect(bays.length).toBe(ed.model.rooms.length);
    for (const b of bays) {
      expect(b.segs.length).toBeGreaterThan(2);
      expect(b.member).toContain(`@ 16" O.C.`);
    }
    const h = headers(ed.model);
    expect(h.list.length).toBeGreaterThan(0);
    expect(h.types.map((t) => t.mark)[0]).toBe("H1");
    expect(h.types.reduce((s, t) => s + t.count, 0)).toBe(h.list.length);
  });

  it("cabios perpendiculares a la cumbrera", () => {
    const ed = new Editor();
    const rf = roofFraming(ed.model);
    expect(rf.some((x) => !x.flat && x.ridges.length && x.rafters.length)).toBe(true);
    for (const r of rf.filter((x) => !x.flat && x.ridges.length)) {
      const [a, b] = r.ridges[0], [c, d] = r.rafters[0];
      const dot = (b.x - a.x) * (d.x - c.x) + (b.y - a.y) * (d.y - c.y);
      expect(Math.abs(dot)).toBeLessThan(1e-6);
    }
  });

  it("el terreno deja los retiros alrededor de la huella", () => {
    const ed = new Editor();
    const s = site(ed.model), b = wallBox(ed.model);
    expect(s.setback[0].x).toBeLessThanOrEqual(b.x0 + 1e-9);
    expect(s.setback[2].x).toBeGreaterThanOrEqual(b.x1 - 1e-9);
    expect(s.lot[2].y - b.y1).toBeCloseTo(25 * FT);
    expect(Math.round(s.w / FT) % 5).toBe(0);
    expect(Math.round(s.d / FT) % 5).toBe(0);
  });

  it("HVAC: una impulsión por espacio climatizado, extractor en el baño y equipo de 1.5 t mínimo", () => {
    const ed = new Editor();
    const h = hvac(ed.model)!;
    expect(h.tons).toBeGreaterThanOrEqual(1.5);
    expect(h.supplies.every((s) => s.cfm >= 50)).toBe(true);
    expect(h.exhausts.length).toBe(ed.model.rooms.filter((r) => /ba[ñn]o/i.test(r.name)).length);
    expect(h.ducts.length).toBe(h.supplies.length + 1);
  });

  it("numera el juego por disciplina", () => {
    const ed = new Editor();
    ed.setUnits("imperial");
    const set = permitSet(ed);
    expect(set.slice(0, 4).map((s) => s.no)).toEqual(["G-001", "G-002", "C-101", "S-101"]);
    const nos = set.map((s) => s.no);
    expect(new Set(nos).size).toBe(nos.length);
    expect(set.map((s) => s.content)).toEqual(expect.arrayContaining(["found", "floorfr", "wallfr", "rooffr", "plan", "fach", "details", "elec", "plum", "hvac"]));
    expect(set.find((s) => s.content === "details")!.no).toBe("A-501");
    expect(set.find((s) => s.content === "details2")!.no).toBe("A-502");
    expect(set.find((s) => s.content === "details3")!.no).toBe("A-503");
    expect(set.find((s) => s.content === "hvac")!.no).toBe("M-101");
  });
});

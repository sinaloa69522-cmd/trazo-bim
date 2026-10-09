import { describe, expect, it } from "vitest";
import { elevation } from "../elevation";
import { finish, outward, ROOFINGS, roofFinish, SIDINGS, usedFinishes } from "../finishes";
import { sampleProject } from "../model";

describe("acabados exteriores", () => {
  it("hay revestimientos y cubiertas con nombres e ids únicos", () => {
    expect(SIDINGS.length).toBeGreaterThanOrEqual(10);
    expect(ROOFINGS.length).toBeGreaterThanOrEqual(10);
    const ids = [...SIDINGS, ...ROOFINGS].map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of [...SIDINGS, ...ROOFINGS]) expect(f.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("el lado exterior de un muro mira lejos del centro del edificio", () => {
    const m = sampleProject().levels[0];
    // en un rectángulo, cada muro exterior tiene su lado de fuera alejado del centro
    for (const w of m.walls) {
      const s = outward(m.walls, w), cx = m.walls.reduce((t, x) => t + (x.x1 + x.x2) / 2, 0) / m.walls.length;
      const cy = m.walls.reduce((t, x) => t + (x.y1 + x.y2) / 2, 0) / m.walls.length;
      const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1), nx = (-(w.y2 - w.y1) / L) * s, ny = ((w.x2 - w.x1) / L) * s;
      expect(((w.x1 + w.x2) / 2 - cx) * nx + ((w.y1 + w.y2) / 2 - cy) * ny).toBeGreaterThanOrEqual(0);
    }
  });

  it("la cubierta inclinada sin elegir es de teja cerámica y la plana no lleva", () => {
    const r = sampleProject().levels[0].roofs[0];
    expect(roofFinish({ ...r, kind: "gable" })?.id).toBe("clay");
    expect(roofFinish({ ...r, kind: "flat" })).toBeUndefined();
    expect(roofFinish({ ...r, finish: "standing-seam" })?.id).toBe("standing-seam");
  });

  it("los alzados muestran el revestimiento y la teja elegidos", () => {
    const p = sampleProject(), lv = p.levels[0];
    for (const w of lv.walls) w.finish = "fiber-lap";
    for (const r of lv.roofs) r.finish = "asphalt-arch";
    const names = new Set(elevation(p, "S").faces.filter((f) => f.mat).map((f) => f.mat!.name));
    expect(names.has(finish("fiber-lap")!.name)).toBe(true);
    expect(names.has(finish("asphalt-arch")!.name)).toBe(true);
    expect(usedFinishes(p.levels).map((f) => f.id)).toEqual(["fiber-lap", "asphalt-arch"]);
  });
});

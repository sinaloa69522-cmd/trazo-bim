import { describe, expect, it } from "vitest";
import { TEMPLATES } from "../templates";
import { computeRooms } from "../rooms";
import { dir } from "../geometry";

describe("plantillas de casa", () => {
  for (const t of TEMPLATES) it(`${t.name}: espacios cerrados, huecos dentro de sus muros y muebles dentro de la casa`, () => {
    const p = t.build(), lv = p.levels[0], g = computeRooms(lv)!;
    for (const r of lv.rooms) expect(g.rooms.get(r.id)?.ok, r.name).toBe(true);
    for (const o of lv.openings) {
      const w = lv.walls.find((x) => x.id === o.wallId)!, L = dir(w).L;
      expect(o.t * L - o.width / 2, `hueco ${o.id}`).toBeGreaterThan(0.1);
      expect(o.t * L + o.width / 2, `hueco ${o.id}`).toBeLessThan(L - 0.1);
    }
    const xs = lv.walls.flatMap((w) => [w.x1, w.x2]), ys = lv.walls.flatMap((w) => [w.y1, w.y2]);
    for (const f of lv.furniture) {
      expect(f.x).toBeGreaterThan(Math.min(...xs)); expect(f.x).toBeLessThan(Math.max(...xs));
      expect(f.y).toBeGreaterThan(Math.min(...ys)); expect(f.y).toBeLessThan(Math.max(...ys));
    }
    expect(lv.roofs).toHaveLength(1);
    expect(lv.runs.length).toBeGreaterThan(0);
  });
});

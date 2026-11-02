import { describe, expect, it } from "vitest";
import { cloudPoints, currentRev, markHit, markPts, nextRevNo } from "../marks";
import { toDxf } from "../dxf";
import { emptyProject } from "../model";
import type { Mark } from "../model";

describe("revisiones", () => {
  it("numera las revisiones siguiendo la secuencia", () => {
    const p = emptyProject();
    expect(currentRev(p)).toBe("1");
    expect(nextRevNo(p)).toBe("1");
    p.info.revisions = [{ no: "0", date: "2026-01-01", desc: "Emisión" }];
    expect(nextRevNo(p)).toBe("1");
    p.info.revisions.push({ no: "1", date: "2026-02-01", desc: "Cambio de cocina" });
    expect(currentRev(p)).toBe("1");
    expect(nextRevNo(p)).toBe("2");
    p.info.revisions = [{ no: "A", date: "", desc: "" }];
    expect(nextRevNo(p)).toBe("B");
  });

  it("la nube rodea el rectángulo con arcos hacia afuera", () => {
    const pts = cloudPoints({ x: 0, y: 0 }, { x: 4, y: 2 }, 0.5);
    expect(pts[0]).toEqual(pts[pts.length - 1]);
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    // los arcos salen del rectángulo medio paso como mucho y nunca entran
    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.min(...xs)).toBeGreaterThan(-0.3);
    expect(Math.max(...ys)).toBeGreaterThan(2);
    for (const p of pts) expect(p.x <= 0.001 || p.x >= 3.999 || p.y <= 0.001 || p.y >= 1.999).toBe(true);
  });

  it("la nube se selecciona por su borde o su triángulo, no por dentro", () => {
    const mk: Mark = { id: 1, kind: "nube", x: 4, y: 2, ax: 0, ay: 0, label: "2" };
    const s = 50;
    expect(markHit(mk, 0, { x: 2, y: 0.02 }, s)).toBeLessThan(Infinity);
    expect(markHit(mk, 0, { x: 4.05, y: 2.05 }, s)).toBeLessThan(Infinity);
    expect(markHit(mk, 0, { x: 2, y: 1 }, s)).toBe(Infinity);
    expect(markPts(mk)).toEqual([{ x: 4, y: 2 }, { x: 0, y: 0 }]);
  });

  it("la nube sale en el DXF en su capa", () => {
    const p = emptyProject();
    p.levels[0].marks = [{ id: 1, kind: "nube", x: 3, y: 2, ax: 0, ay: 0, label: "1" }];
    const d = toDxf(p.levels[0], null);
    expect(d).toContain("A-REVISION");
  });
});

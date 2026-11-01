import { describe, expect, it } from "vitest";
import { arcPoints, arcThrough } from "../arc";

describe("muros curvos", () => {
  it("medio círculo por tres puntos", () => {
    const arc = arcThrough({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 2 })!;
    expect(arc.r).toBeCloseTo(2); expect(arc.cx).toBeCloseTo(2); expect(arc.cy).toBeCloseTo(0);
    const pts = arcPoints(arc);
    expect(pts[0].x).toBeCloseTo(0); expect(pts[pts.length - 1].x).toBeCloseTo(4);
    // pasa por el lado de c (y positivo)
    expect(Math.max(...pts.map((p) => p.y))).toBeCloseTo(2, 1);
    for (const p of pts) expect(Math.hypot(p.x - 2, p.y)).toBeCloseTo(2);
  });
  it("puntos alineados no forman arco", () => {
    expect(arcThrough({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 0 })).toBeNull();
  });
});

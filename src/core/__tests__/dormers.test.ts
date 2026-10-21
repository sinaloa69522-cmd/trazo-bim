import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { dormerCenter, dormerGeom, roofAxes } from "../dormers";
import { elevation } from "../elevation";
import { roofGeom } from "../geometry";
import { transformElements, translation } from "../transform";

/** La casa de ejemplo con su cubierta a dos aguas y una buhardilla al centro del faldón de enfrente. */
function withDormer() {
  const ed = new Editor(), r = ed.model.roofs[0];
  r.kind = "gable"; r.pitch = 35;
  const o = roofGeom(r).outline, c = { x: (o[0].x + o[2].x) / 2, y: o[2].y - 1.2 };
  ed.setTool("dormer");
  ed.commitPoint(c);
  return { ed, r };
}

describe("buhardillas", () => {
  it("se colocan con un clic en el faldón y quedan dentro de él", () => {
    const { r } = withDormer();
    expect(r.dormers).toHaveLength(1);
    const g = dormerGeom(r, r.dormers![0])!, top = roofGeom(r).top;
    expect(g).not.toBeNull();
    for (const f of [...g.roof, ...g.walls]) for (const q of f) expect(q.z).toBeLessThanOrEqual(top + 1e-6);
    expect(g.glass).toHaveLength(1);
  });
  it("el techo de la de dos aguas muere sobre el faldón", () => {
    const { r } = withDormer(), dm = r.dormers![0], g = dormerGeom(r, dm)!, A = roofAxes(r);
    // los puntos del fondo del techo están en el plano del faldón: z = arranque + t·pendiente + espesor
    for (const q of g.roof.flatMap((f) => f.slice(2))) {
      const v = A.alongX ? q.y : q.x, t = dm.side ? A.V1 - A.o - v : v - A.V0 - A.o;
      expect(q.z).toBeCloseTo(r.base + t * A.tan + A.lift, 6);
    }
  });
  it("no se pone en una azotea ni pasada la cumbrera", () => {
    const { ed, r } = withDormer();
    r.kind = "flat";
    expect(typeof ed.dormerCandidate({ x: (r.x1 + r.x2) / 2, y: (r.y1 + r.y2) / 2 })).toBe("string");
    r.kind = "gable";
    expect(dormerGeom(r, { ...r.dormers![0], h: 5 })).toBeNull();
  });
  it("se mueve con la cubierta y sale en la fachada", () => {
    const { ed, r } = withDormer(), before = dormerCenter(r, r.dormers![0]);
    transformElements(ed.model, [{ type: "roof", id: r.id }], translation(2, 1), false);
    const after = dormerCenter(r, r.dormers![0]);
    expect(after.x - before.x).toBeCloseTo(2);
    expect(after.y - before.y).toBeCloseTo(1);
    const el = elevation(ed.project, "S");
    expect(el.faces.some((f) => f.kind === "glass" && f.pts.some((p) => p.z > r.base + 0.5))).toBe(true);
  });
});

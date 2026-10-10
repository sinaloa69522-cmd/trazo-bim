import { describe, expect, it } from "vitest";
import { Editor } from "../../editor/Editor";
import { budget } from "../budget";
import { furnitureDef, furnitureOutline, furnitureSolids, FURNITURE_CATS } from "../furniture";
import { CAB_CAT, KITCHEN } from "../kitchen";
import { emptyProject } from "../model";

describe("gabinetes de cocina", () => {
  it("forman su propio grupo del catálogo con medidas comerciales", () => {
    expect(FURNITURE_CATS).toContain(CAB_CAT);
    expect(KITCHEN.length).toBeGreaterThanOrEqual(15);
    for (const k of KITCHEN) expect(furnitureSolids(k.kind).length).toBeGreaterThan(0);
    // bajos con la cubierta a 90 cm; altos de 1.45 a 2.15 m
    expect(Math.max(...furnitureSolids("cab-b60").map((s) => s.z0 + s.h))).toBeCloseTo(0.9);
    const w = furnitureSolids("cab-w60")[0];
    expect([w.z0, w.z0 + w.h]).toEqual([1.45, 2.15]);
    expect(furnitureDef("cab-w60").draw().every((s) => s.dash)).toBe(true);
  });

  it("se pegan al muro con el frente hacia el local y se alinean uno junto a otro", () => {
    const ed = new Editor();
    ed.project = emptyProject();
    ed.model.walls.push({ type: "generico", id: 1, x1: 0, y1: 0, x2: 4, y2: 0, thick: 0.15, height: 2.7, attach: true });
    ed.model.walls.push({ type: "generico", id: 2, x1: 0, y1: 0, x2: 0, y2: 3, thick: 0.15, height: 2.7, attach: true });
    ed.defaults.furnKind = "cab-b60";
    const a = ed.furnitureCandidate({ x: 0.5, y: 0.3 });
    // contra el muro de y = 0, del lado del clic, y arrimado al muro de x = 0
    expect(a.y).toBeCloseTo(0.075 + 0.3);
    expect(a.x).toBeCloseTo(0.075 + 0.3);
    ed.model.furniture.push({ id: 10, kind: "cab-b60", ...a });
    ed.defaults.furnKind = "cab-sink80";
    const b = ed.furnitureCandidate({ x: 1.15, y: 0.4 });
    expect(b.x).toBeCloseTo(0.075 + 0.6 + 0.4);
    expect(b.rot).toBe(a.rot);
    // el frente (+y local) mira hacia el local
    const o = furnitureOutline({ id: 0, kind: "cab-b60", ...a });
    expect(Math.min(...o.map((p) => p.y))).toBeCloseTo(0.075);
  });

  it("salen en el presupuesto por metro lineal", () => {
    const p = emptyProject();
    p.levels[0].furniture.push({ id: 1, kind: "cab-b90", x: 0, y: 0, rot: 0 }, { id: 2, kind: "cab-sink120", x: 1, y: 0, rot: 0 }, { id: 3, kind: "cab-w60", x: 0, y: 0, rot: 0 });
    const items = budget(p).chapters.flatMap((c) => c.items);
    expect(items.find((i) => i.code === "09.20")?.qty).toBeCloseTo(2.1);
    expect(items.find((i) => i.code === "09.21")?.qty).toBeCloseTo(0.6);
  });
});

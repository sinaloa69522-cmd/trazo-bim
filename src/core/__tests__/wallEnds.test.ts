import { describe, expect, it } from "vitest";
import { parapet, wallEnds } from "../geometry";
import { emptyModel, type Wall } from "../model";

const W = (id: number, x1: number, y1: number, x2: number, y2: number, thick = 0.2) => ({ id, x1, y1, x2, y2, thick, height: 2.7 }) as Wall;

describe("muros a inglete en 3D", () => {
  it("en una esquina en L la cara de fuera llega a la esquina exterior y la de dentro a la interior", () => {
    const m = emptyModel();
    const a = W(1, 0, 0, 4, 0), b = W(2, 4, 0, 4, 3);
    m.walls.push(a, b);
    // a va hacia +x; su izquierda (+y) es el lado de b: interior
    const [s0, s1] = wallEnds(m, a);
    expect(s0).toBeNull();
    expect(s1![0]).toBeCloseTo(4.1); // derecha (y = −0,1): fuera
    expect(s1![1]).toBeCloseTo(3.9); // izquierda: dentro
    const [t0] = wallEnds(m, b);
    // b va hacia +y; su izquierda (−x) es el lado de a: interior
    expect(t0![0]).toBeCloseTo(-0.1);
    expect(t0![1]).toBeCloseTo(0.1);
  });
  it("dos muros en línea acaban a tope y con tres en el punto no se toca", () => {
    const m = emptyModel();
    m.walls.push(W(1, 0, 0, 4, 0), W(2, 4, 0, 8, 0));
    expect(wallEnds(m, m.walls[0])[1]).toEqual([4, 4]);
    m.walls.push(W(3, 4, 0, 4, 3));
    expect(wallEnds(m, m.walls[0])[1]).toBeNull();
  });
});

describe("pretil de azotea", () => {
  const r = { id: 1, x1: 0, y1: 0, x2: 10, y2: 7, kind: "flat" as const, pitch: 0, overhang: 0.2, base: 2.7, thick: 0.15 };
  it("va sobre el borde de la losa con su volado, 0,60 m por omisión", () => {
    const p = parapet(r)!;
    expect(p.h).toBe(0.6);
    expect(p.z).toBeCloseTo(2.85);
    expect(p.outer[0]).toEqual({ x: -0.2, y: -0.2 });
    expect(p.inner[0].x).toBeCloseTo(-0.05);
  });
  it("no hay pretil en cubiertas inclinadas ni con altura 0", () => {
    expect(parapet({ ...r, kind: "gable" })).toBeNull();
    expect(parapet({ ...r, parapet: 0 })).toBeNull();
  });
});

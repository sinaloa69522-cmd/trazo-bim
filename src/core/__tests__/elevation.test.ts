import { describe, expect, it } from "vitest";
import { elevation } from "../elevation";
import { sampleProject } from "../model";

describe("alzados", () => {
  it("el alzado sur muestra la puerta y la ventana de la fachada sur, y el tejado", () => {
    const el = elevation(sampleProject(), "S");
    // muro sur (y = 7): una puerta y una ventana, vistas desde fuera
    const near = (k: string) => el.faces.filter((f) => f.kind === k && f.depth > 7);
    expect(near("door")).toHaveLength(1);
    expect(near("glass")).toHaveLength(1);
    expect(el.faces.some((f) => f.kind === "roof")).toBe(true);
    expect(el.u1 - el.u0).toBeCloseTo(11); // 10 m más 0.5 m de vuelo a cada lado
    expect(el.z1).toBeGreaterThan(4.5); // cumbrera
  });

  it("ordena las caras de la más lejana a la más cercana", () => {
    const { faces } = elevation(sampleProject(), "E");
    expect(faces.every((f, i) => i === 0 || faces[i - 1].depth <= f.depth)).toBe(true);
  });

  it("los cuatro alzados tienen el mismo alto y el este y el oeste son simétricos en ancho", () => {
    const p = sampleProject();
    const [s, e, n, o] = (["S", "E", "N", "O"] as const).map((f) => elevation(p, f));
    expect(n.z1).toBeCloseTo(s.z1);
    expect(e.u1 - e.u0).toBeCloseTo(o.u1 - o.u0);
    expect(e.u1 - e.u0).toBeCloseTo(8);
  });
});

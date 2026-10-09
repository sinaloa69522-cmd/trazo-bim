import { dimOffset, dir, loc, type Pt } from "./geometry";
import type { Dim, Model } from "./model";

/** Fachada: o apunta hacia fuera y t a lo largo de ella (base ortonormal en planta). */
const SIDES: { id: string; o: Pt; t: Pt }[] = [
  { id: "N", o: { x: 0, y: -1 }, t: { x: 1, y: 0 } },
  { id: "S", o: { x: 0, y: 1 }, t: { x: 1, y: 0 } },
  { id: "O", o: { x: -1, y: 0 }, t: { x: 0, y: 1 } },
  { id: "E", o: { x: 1, y: 0 }, t: { x: 0, y: 1 } },
];
/** Separación de cada cadena respecto a la cara del muro: huecos, muros y total. */
export const CHAIN_OFFSETS = [0.6, 1.1, 1.6];

const dot = (p: Pt, q: Pt) => p.x * q.x + p.y * q.y;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Cadenas de cotas exteriores de cada fachada, como el acotado automático de Revit:
 * la primera mide los huecos, la segunda los muros que acometen y la tercera el total,
 * todas a cara exterior. Solo tiene en cuenta muros paralelos a los ejes.
 */
export function autoDims(m: Model): Omit<Dim, "id">[] {
  const out: Omit<Dim, "id">[] = [];
  for (const { o, t } of SIDES) {
    const P = (u: number, v: number): Pt => ({ x: r3(u * t.x + v * o.x), y: r3(u * t.y + v * o.y) });
    const along = m.walls.filter((w) => { const d = dir(w); return d.L > 0.05 && Math.abs(d.ux * o.x + d.uy * o.y) < 0.01; });
    if (!along.length) continue;
    const vmax = Math.max(...along.map((w) => dot({ x: w.x1, y: w.y1 }, o)));
    const side = along.filter((w) => dot({ x: w.x1, y: w.y1 }, o) > vmax - 0.05);
    const th = Math.max(...side.map((w) => w.thick)), face = vmax + th / 2;
    const us = side.flatMap((w) => [dot({ x: w.x1, y: w.y1 }, t), dot({ x: w.x2, y: w.y2 }, t)]);
    const u0 = Math.min(...us) - th / 2, u1 = Math.max(...us) + th / 2;
    const clamp = (u: number) => Math.max(u0, Math.min(u1, u));

    const holes: number[] = [];
    for (const w of side) for (const op of m.openings.filter((x) => x.wallId === w.id)) {
      const L = dir(w).L, s = op.t * L;
      holes.push(dot(loc(w, s - op.width / 2, 0), t), dot(loc(w, s + op.width / 2, 0), t));
    }
    const cross: number[] = [];
    for (const w of m.walls) {
      const d = dir(w);
      if (d.L < 0.05 || Math.abs(d.ux * t.x + d.uy * t.y) > 0.01) continue;
      // acomete a la fachada si uno de sus extremos llega a la línea de los muros de fachada
      const near = [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }].some((p) => Math.abs(dot(p, o) - vmax) < th / 2 + 0.05);
      if (!near) continue;
      const u = dot({ x: w.x1, y: w.y1 }, t);
      if (u < u0 - 0.01 || u > u1 + 0.01) continue;
      cross.push(u - w.thick / 2, u + w.thick / 2);
    }
    const chain = (inner: number[]) => {
      const pts = [u0, ...inner.map(clamp), u1].sort((a, b) => a - b).filter((u, i, a) => i === 0 || u - a[i - 1] > 0.005);
      return pts.map(r3);
    };
    const chains = [chain(holes), chain(cross), chain([])];
    const seen = new Set<string>();
    chains.forEach((pts, k) => {
      const key = pts.join(",");
      // una cadena igual a otra ya puesta (o sin puntos intermedios, salvo la total) no aporta nada
      if (seen.has(key) || (k < 2 && pts.length < 3)) return;
      seen.add(key);
      const off = face + CHAIN_OFFSETS[k];
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = P(pts[i], face), b = P(pts[i + 1], face);
        out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, off: r3(dimOffset(a, b, P(pts[i], off))), auto: true });
      }
    });
  }
  return out;
}

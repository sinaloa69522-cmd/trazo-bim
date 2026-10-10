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

/** Separación de las cotas interiores respecto a la cara del muro, dentro de la habitación. */
export const INNER_OFFSET = 0.45;

/**
 * Cotas interiores de cada habitación, a caras de muro: el ancho libre junto al muro de arriba
 * y el largo libre junto al de la izquierda, para no pisar el rótulo del centro.
 * Se buscan los muros paralelos a los ejes más cercanos a la semilla de la habitación.
 */
export function interiorDims(m: Model): Omit<Dim, "id">[] {
  const out: Omit<Dim, "id">[] = [], seen = new Set<string>();
  const ortho = m.walls.map((w) => ({ w, d: dir(w) })).filter(({ d }) => d.L > 0.05 && (Math.abs(d.ux) < 0.01 || Math.abs(d.uy) < 0.01));
  /** Caras de muro más cercanas a p hacia un lado y otro, a lo largo de x (horiz) o de y. */
  const faces = (p: Pt, horiz: boolean): [number, number] | null => {
    let lo = -Infinity, hi = Infinity;
    const c = horiz ? p.x : p.y, q = horiz ? p.y : p.x;
    for (const { w, d } of ortho) {
      // el rayo horizontal choca con muros verticales, y al revés
      if (horiz ? Math.abs(d.ux) > 0.01 : Math.abs(d.uy) > 0.01) continue;
      const a = horiz ? Math.min(w.y1, w.y2) : Math.min(w.x1, w.x2), b = horiz ? Math.max(w.y1, w.y2) : Math.max(w.x1, w.x2);
      if (q < a - w.thick / 2 || q > b + w.thick / 2) continue;
      const k = horiz ? w.x1 : w.y1, h = w.thick / 2;
      if (k + h <= c && k + h > lo) lo = k + h;
      if (k - h >= c && k - h < hi) hi = k - h;
    }
    return isFinite(lo) && isFinite(hi) ? [lo, hi] : null;
  };
  for (const r of m.rooms) {
    const v = faces(r, false), h = faces(r, true);
    if (!v || !h) continue;
    // el ancho se mide junto al muro de arriba y el largo junto al de la izquierda
    const yh = v[1] - v[0] > 2 * INNER_OFFSET + 0.3 ? v[0] + INNER_OFFSET : r.y, hx = faces({ x: r.x, y: yh }, true);
    const xv = h[1] - h[0] > 2 * INNER_OFFSET + 0.3 ? h[0] + INNER_OFFSET : r.x, vy = faces({ x: xv, y: r.y }, false);
    const add = (a: Pt, b: Pt) => {
      if (Math.hypot(b.x - a.x, b.y - a.y) < 0.3) return;
      const d = { x1: r3(a.x), y1: r3(a.y), x2: r3(b.x), y2: r3(b.y), off: 0, auto: true, inner: true };
      const k = [d.x1, d.y1, d.x2, d.y2].join(",");
      if (!seen.has(k)) { seen.add(k); out.push(d); }
    };
    if (hx) add({ x: hx[0], y: yh }, { x: hx[1], y: yh });
    if (vy) add({ x: xv, y: vy[0] }, { x: xv, y: vy[1] });
  }
  return out;
}

/** Todas las cotas automáticas de un nivel: las exteriores en cadena y, si se piden, las interiores. */
export function allAutoDims(m: Model, inner = true): Omit<Dim, "id">[] {
  return [...autoDims(m), ...(inner ? interiorDims(m) : [])];
}

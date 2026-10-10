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

/** ¿Sale de p en dirección d sin chocar con ningún muro (salvo skip)? */
function escapes(walls: Model["walls"], p: Pt, d: Pt, skip: object) {
  for (const w of walls) {
    if (w === skip) continue;
    // intersección del rayo p + t·d con el segmento del eje del muro, ensanchado medio espesor por los extremos
    const { ux, uy, L } = dir(w), h = w.thick / 2;
    const ax = w.x1 - ux * h, ay = w.y1 - uy * h, ex = ux * (L + 2 * h), ey = uy * (L + 2 * h);
    const den = d.x * ey - d.y * ex;
    if (Math.abs(den) < 1e-12) continue;
    const qx = ax - p.x, qy = ay - p.y;
    const t = (qx * ey - qy * ex) / den, s = (qx * d.y - qy * d.x) / den;
    if (t > 1e-6 && s >= 0 && s <= 1) return false;
  }
  return true;
}

/**
 * Lado exterior de un muro: +1 o −1 (el de la normal de loc) si por ese lado se sale del edificio
 * sin cruzar otro muro, 0 si es un muro interior. Se prueba en tres puntos a lo largo del muro.
 */
export function exteriorSide(walls: Model["walls"], w: Model["walls"][number]): 1 | -1 | 0 {
  const { ux, uy, L } = dir(w);
  const score = (n: 1 | -1) => [0.2, 0.5, 0.8].filter((t) => escapes(walls, loc(w, t * L, n * (w.thick / 2 + 0.01)), { x: -uy * n, y: ux * n }, w)).length;
  const a = score(1), b = score(-1);
  if (a < 2 && b < 2) return 0;
  return a >= b ? 1 : -1;
}

/**
 * Cadenas de cotas exteriores, como el acotado automático de Revit. En cada fachada (norte, sur, este, oeste)
 * se proyectan sobre la línea más exterior todos los muros exteriores que miran a ese lado, también los remetidos:
 * la primera cadena mide los huecos, la segunda los quiebres de la fachada y los muros que acometen, y la tercera
 * el total, todo a cara exterior. Los muros exteriores inclinados llevan su propia cota, alineada con ellos.
 */
export function autoDims(m: Model): Omit<Dim, "id">[] {
  const out: Omit<Dim, "id">[] = [];
  const ext = new Map(m.walls.map((w) => [w, dir(w).L > 0.05 ? exteriorSide(m.walls, w) : 0] as const));
  /** Normal exterior del muro (unitaria), o null si es interior. */
  const nrm = (w: Model["walls"][number]): Pt | null => { const s = ext.get(w); if (!s) return null; const d = dir(w); return { x: -d.uy * s, y: d.ux * s }; };
  for (const { o, t } of SIDES) {
    const P = (u: number, v: number): Pt => ({ x: r3(u * t.x + v * o.x), y: r3(u * t.y + v * o.y) });
    // muros exteriores paralelos a esta fachada que miran hacia fuera por ella
    const side = m.walls.filter((w) => { const n = nrm(w); return n && Math.abs(dir(w).ux * o.x + dir(w).uy * o.y) < 0.01 && dot(n, o) > 0.99; });
    if (!side.length) continue;
    const face = Math.max(...side.map((w) => dot({ x: w.x1, y: w.y1 }, o) + w.thick / 2));
    // los inclinados que también miran a este lado (un chaflán) cuentan para el total y marcan quiebres
    const slant = m.walls.filter((w) => { const n = nrm(w), d = dir(w); return n && Math.abs(d.ux) > 0.01 && Math.abs(d.uy) > 0.01 && dot(n, o) > 0.1; });
    const corners = slant.flatMap((w) => [dot({ x: w.x1, y: w.y1 }, t), dot({ x: w.x2, y: w.y2 }, t)]);
    const us = [...side.flatMap((w) => [dot({ x: w.x1, y: w.y1 }, t), dot({ x: w.x2, y: w.y2 }, t)]), ...corners];
    const th = Math.max(...side.map((w) => w.thick));
    // los extremos: las caras exteriores de los muros que cierran la fachada por los lados
    const ends = m.walls.filter((w) => { const n = nrm(w); return n && Math.abs(dot(n, t)) > 0.99; }).map((w) => dot({ x: w.x1, y: w.y1 }, t) + dot(nrm(w)!, t) * w.thick / 2);
    const lo = Math.min(...us), hi = Math.max(...us);
    const u0 = Math.min(lo - th / 2, ...ends.filter((u) => u < lo + 0.01 && u > lo - th)), u1 = Math.max(hi + th / 2, ...ends.filter((u) => u > hi - 0.01 && u < hi + th));
    const clamp = (u: number) => Math.max(u0, Math.min(u1, u));

    const holes: number[] = [];
    for (const w of side) for (const op of m.openings.filter((x) => x.wallId === w.id)) {
      const L = dir(w).L, s = op.t * L;
      holes.push(dot(loc(w, s - op.width / 2, 0), t), dot(loc(w, s + op.width / 2, 0), t));
    }
    const cross: number[] = [];
    /** ¿Llega p a un extremo de un muro de esta fachada? */
    const touches = (p: Pt) => [...side, ...slant].some((sw) => [{ x: sw.x1, y: sw.y1 }, { x: sw.x2, y: sw.y2 }].some((q) => Math.hypot(p.x - q.x, p.y - q.y) < sw.thick + 0.05));
    for (const w of m.walls) {
      const d = dir(w);
      if (d.L < 0.05 || Math.abs(d.ux * t.x + d.uy * t.y) > 0.01) continue;
      const u = dot({ x: w.x1, y: w.y1 }, t);
      if (u < u0 - 0.01 || u > u1 + 0.01) continue;
      const n = nrm(w);
      // quiebre de la fachada: un muro exterior que la cierra o la remete marca su cara exterior
      if (n) { if (touches({ x: w.x1, y: w.y1 }) || touches({ x: w.x2, y: w.y2 })) cross.push(u + dot(n, t) * w.thick / 2); continue; }
      // un muro interior acomete si uno de sus extremos llega a un muro de la fachada
      const near = [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }].some((p) => side.some((sw) => Math.abs(dot(p, o) - dot({ x: sw.x1, y: sw.y1 }, o)) < sw.thick / 2 + 0.05));
      if (near) cross.push(u - w.thick / 2, u + w.thick / 2);
    }
    // los vértices de un chaflán, salvo que caigan junto a otro quiebre ya marcado
    for (const c of corners) if (![u0, u1, ...cross].some((u) => Math.abs(u - c) < 0.1)) cross.push(c);
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
  // muros exteriores inclinados: huecos y largo a cara exterior, paralelos al muro
  for (const w of m.walls) {
    const n = nrm(w), d = dir(w);
    if (!n || Math.abs(d.ux) < 0.01 || Math.abs(d.uy) < 0.01) continue;
    const s = ext.get(w)!, h = (w.thick / 2) * s;
    const holes = m.openings.filter((x) => x.wallId === w.id).flatMap((op) => [op.t * d.L - op.width / 2, op.t * d.L + op.width / 2]);
    const pts = [0, ...holes, d.L].map((v) => Math.max(0, Math.min(d.L, v))).sort((a, b) => a - b).filter((v, i, a) => i === 0 || v - a[i - 1] > 0.005);
    const chains = pts.length > 2 ? [pts, [0, d.L]] : [[0, d.L]];
    chains.forEach((c, k) => {
      for (let i = 0; i + 1 < c.length; i++) {
        const a = loc(w, c[i], h), b = loc(w, c[i + 1], h), q = loc(w, c[i], h + CHAIN_OFFSETS[k] * s);
        out.push({ x1: r3(a.x), y1: r3(a.y), x2: r3(b.x), y2: r3(b.y), off: r3(dimOffset(a, b, q)), auto: true });
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

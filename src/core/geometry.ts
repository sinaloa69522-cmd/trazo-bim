import type { Dim, Model, Opening, Wall } from "./model";

export interface Pt {
  x: number;
  y: number;
}

type Seg = { x1: number; y1: number; x2: number; y2: number };

export function dir(w: Seg) {
  const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1e-9;
  return { ux: (w.x2 - w.x1) / L, uy: (w.y2 - w.y1) / L, L };
}

/** Punto en coordenadas locales del muro: s a lo largo, n perpendicular. */
export function loc(w: Seg, s: number, n: number): Pt {
  const { ux, uy } = dir(w);
  return { x: w.x1 + ux * s - uy * n, y: w.y1 + uy * s + ux * n };
}

export function distSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { d: Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)), t };
}

/** Prolonga el extremo del muro medio espesor si otro muro termina en el mismo punto (esquina limpia). */
export function endExt(m: Model, w: Wall, end: 0 | 1) {
  const x = end ? w.x2 : w.x1, y = end ? w.y2 : w.y1;
  for (const o of m.walls) {
    if (o === w) continue;
    if (Math.hypot(o.x1 - x, o.y1 - y) < 0.01 || Math.hypot(o.x2 - x, o.y2 - y) < 0.01) return w.thick / 2;
  }
  return 0;
}

export interface WallPieces {
  /** Tramos macizos [inicio, fin] a lo largo del muro */
  solids: [number, number][];
  ops: { o: Opening; a: number; b: number }[];
  L: number;
}

export function pieces(m: Model, w: Wall): WallPieces {
  const { L } = dir(w);
  const ops = m.openings
    .filter((o) => o.wallId === w.id)
    .map((o) => ({ o, a: o.t * L - o.width / 2, b: o.t * L + o.width / 2 }))
    .sort((p, q) => p.a - q.a);
  const solids: [number, number][] = [];
  let s = -endExt(m, w, 0);
  for (const p of ops) {
    if (p.a > s) solids.push([s, p.a]);
    s = Math.max(s, p.b);
  }
  const e = L + endExt(m, w, 1);
  if (e > s) solids.push([s, e]);
  return { solids, ops, L };
}

/** ¿Cabe un hueco de este ancho centrado en t sin salirse ni solaparse con otros? */
export function fits(m: Model, w: Wall, t: number, width: number, ignoreId?: number) {
  const { L } = dir(w);
  const a = t * L - width / 2, b = t * L + width / 2;
  if (a < 0.05 || b > L - 0.05) return false;
  return !m.openings.some(
    (o) => o.wallId === w.id && o.id !== ignoreId &&
      !(b <= o.t * L - o.width / 2 + 1e-6 || a >= o.t * L + o.width / 2 - 1e-6),
  );
}

export function dimGeom(d: Dim) {
  const L = Math.hypot(d.x2 - d.x1, d.y2 - d.y1) || 1;
  const nx = -(d.y2 - d.y1) / L, ny = (d.x2 - d.x1) / L;
  return { L, nx, ny, a: { x: d.x1 + nx * d.off, y: d.y1 + ny * d.off }, b: { x: d.x2 + nx * d.off, y: d.y2 + ny * d.off } };
}

export function dimOffset(a: Pt, b: Pt, p: Pt) {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return (p.x - a.x) * (-(b.y - a.y) / L) + (p.y - a.y) * ((b.x - a.x) / L);
}

export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Extensión del dibujo con 1.5 m de margen. */
export function bounds(m: Model): Bounds {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x: number, y: number) => {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  };
  for (const s of [...m.walls, ...m.lines, ...m.dims]) { add(s.x1, s.y1); add(s.x2, s.y2); }
  if (!isFinite(x0)) return { x0: -5, y0: -4, x1: 5, y1: 4 };
  return { x0: x0 - 1.5, y0: y0 - 1.5, x1: x1 + 1.5, y1: y1 + 1.5 };
}

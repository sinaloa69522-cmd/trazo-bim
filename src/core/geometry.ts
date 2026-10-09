import type { Dim, Model, Opening, Roof, Stair, Wall } from "./model";

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
export function bounds(m: Model, extra: Pt[] = []): Bounds {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x: number, y: number) => {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  };
  for (const s of [...m.walls, ...m.lines, ...m.dims, ...(m.roofs ?? []), ...(m.stairs ?? [])]) { add(s.x1, s.y1); add(s.x2, s.y2); }
  for (const sl of m.slabs ?? []) for (const p of sl.pts) add(p.x, p.y);
  for (const f of m.furniture ?? []) add(f.x, f.y);
  for (const t of m.texts ?? []) for (const p of textBox(t)) add(p.x, p.y);
  for (const p of extra) add(p.x, p.y);
  if (!isFinite(x0)) return { x0: -5, y0: -4, x1: 5, y1: 4 };
  return { x0: x0 - 1.5, y0: y0 - 1.5, x1: x1 + 1.5, y1: y1 + 1.5 };
}

/** Rectángulo aproximado que ocupa un texto (ancho medio de letra 0.6 de la altura), girado. */
export function textBox(t: { x: number; y: number; text: string; size: number; rot: number }): Pt[] {
  const w = Math.max(1, t.text.length) * t.size * 0.6, h = t.size, a = (t.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  // el eje y de la planta va hacia abajo: un giro antihorario en pantalla es (c, -s)
  const P = (u: number, v: number) => ({ x: t.x + u * c + v * s, y: t.y - u * s + v * c });
  return [P(0, 0.25 * h), P(w, 0.25 * h), P(w, -h), P(0, -h)];
}

/** ¿Está el punto dentro del polígono? (regla par-impar) */
export function pointInPolygon(p: Pt, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Área de un polígono simple (fórmula del área de Gauss), siempre positiva. */
export function polygonArea(poly: Pt[]) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  return Math.abs(a) / 2;
}

/** Superficie neta de una losa: el contorno menos sus huecos. */
export function slabArea(sl: { pts: Pt[]; holes: Pt[][] }) {
  return polygonArea(sl.pts) - sl.holes.reduce((s, h) => s + polygonArea(h), 0);
}

/** ¿Cae el punto sobre la losa (dentro del contorno y fuera de los huecos)? */
export function onSlab(p: Pt, sl: { pts: Pt[]; holes: Pt[][] }) {
  return pointInPolygon(p, sl.pts) && !sl.holes.some((h) => pointInPolygon(p, h));
}

/** Punto 3D: x, y de la planta y z altura sobre la cota del nivel. */
export interface P3 { x: number; y: number; z: number }

export interface RoofGeom {
  /** Contorno del alero en planta */
  outline: Pt[];
  /** Aristas interiores (cumbrera, limatesas) para dibujar en planta */
  ridges: [Pt, Pt][];
  /** Faldones (polígonos convexos) en 3D */
  faces: P3[][];
  /** Hastiales: triángulos verticales sobre los muros de los extremos en las cubiertas a dos aguas */
  gables: P3[][];
  /** Altura de la cumbrera sobre la cota del nivel */
  top: number;
}

/**
 * Geometría de una cubierta rectangular. La cumbrera va siempre en la dirección larga.
 * A dos aguas cae hacia los lados largos; a cuatro aguas, hacia los cuatro lados.
 */
export function roofGeom(r: Roof): RoofGeom {
  const o = r.overhang;
  const x0 = Math.min(r.x1, r.x2) - o, x1 = Math.max(r.x1, r.x2) + o;
  const y0 = Math.min(r.y1, r.y2) - o, y1 = Math.max(r.y1, r.y2) + o;
  const outline = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  // el alero baja con la pendiente lo que vuela, para que el plano pase por el arranque sobre el muro
  const tan = Math.tan((Math.max(0, Math.min(75, r.pitch)) * Math.PI) / 180);
  const z0 = r.kind === "flat" ? r.base : r.base - o * tan;
  // los faldones se dibujan por su cara superior: el espesor medido en vertical tapa la coronación de los muros
  const lift = r.kind === "flat" ? r.thick : r.thick / Math.cos(Math.atan(tan));
  if (r.kind === "flat") {
    const f = outline.map((p) => ({ ...p, z: z0 + lift }));
    return { outline, ridges: [], faces: [f], gables: [], top: z0 + lift };
  }
  // trabajamos en ejes locales: u en la dirección larga, v en la corta
  const alongX = x1 - x0 >= y1 - y0;
  const U0 = alongX ? x0 : y0, U1 = alongX ? x1 : y1, V0 = alongX ? y0 : x0, V1 = alongX ? y1 : x1;
  const half = (V1 - V0) / 2, vm = (V0 + V1) / 2, zt = z0 + half * tan;
  const P = (u: number, v: number, z: number): P3 => (alongX ? { x: u, y: v, z } : { x: v, y: u, z });
  const pt = (q: P3): Pt => ({ x: q.x, y: q.y });
  const inset = r.kind === "hip" ? Math.min(half, (U1 - U0) / 2) : 0;
  const ra = P(U0 + inset, vm, zt), rb = P(U1 - inset, vm, zt);
  const c00 = P(U0, V0, z0), c10 = P(U1, V0, z0), c11 = P(U1, V1, z0), c01 = P(U0, V1, z0);
  const faces: P3[][] = [[c00, c10, rb, ra], [c11, c01, ra, rb]];
  const gables: P3[][] = [];
  const ridges: [Pt, Pt][] = [];
  if (Math.hypot(rb.x - ra.x, rb.y - ra.y) > 1e-6) ridges.push([pt(ra), pt(rb)]);
  if (r.kind === "hip") {
    faces.push([c01, c00, ra], [c10, c11, rb]);
    ridges.push([pt(c00), pt(ra)], [pt(c01), pt(ra)], [pt(c10), pt(rb)], [pt(c11), pt(rb)]);
  } else {
    // hastiales sobre la línea del muro (sin el vuelo), del arranque a la cumbrera
    const ua = U0 + o, ub = U1 - o, va = V0 + o, vb = V1 - o;
    gables.push([P(ua, va, r.base), P(ua, vm, zt + lift), P(ua, vb, r.base)], [P(ub, va, r.base), P(ub, vm, zt + lift), P(ub, vb, r.base)]);
  }
  const top = (f: P3[]) => f.filter((q, i) => i === 0 || Math.hypot(q.x - f[i - 1].x, q.y - f[i - 1].y) > 1e-6).map((q) => ({ ...q, z: q.z + lift }));
  return { outline, ridges, faces: faces.map(top), gables, top: zt + lift };
}

/** Peldaños de una escalera recta: número, huella y contrahuella. */
export function stairSteps(s: Stair) {
  const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
  const n = Math.max(2, Math.round(s.height / 0.175));
  return { n, L, tread: L / n, riser: s.height / n };
}

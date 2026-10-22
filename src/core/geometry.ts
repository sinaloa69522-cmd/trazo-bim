import type { Dim, Model, Opening, Roof, Wall } from "./model";
import { markPts } from "./marks";

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

/**
 * Extremos a inglete de un muro en 3D: dónde acaba cada cara (s a lo largo del muro) en las esquinas en L,
 * para que los dos muros se encuentren sin traslaparse. [derecha, izquierda] por extremo; null si se deja
 * la prolongación de siempre (sin otro muro, o con más de uno en ese punto). Dos muros en línea acaban a tope en el punto.
 */
export function wallEnds(m: Model, w: Wall): [[number, number] | null, [number, number] | null] {
  const { ux, uy, L } = dir(w), nL = { x: -uy, y: ux }, t = w.thick / 2;
  const end = (e: 0 | 1): [number, number] | null => {
    const J = e ? { x: w.x2, y: w.y2 } : { x: w.x1, y: w.y1 }, near = (x: number, y: number) => Math.hypot(x - J.x, y - J.y) < 0.01;
    const others = m.walls.filter((o) => o !== w && (near(o.x1, o.y1) || near(o.x2, o.y2)));
    if (others.length !== 1) return null;
    const o = others[0], far = near(o.x1, o.y1) ? { x: o.x2, y: o.y2 } : { x: o.x1, y: o.y1 };
    const bl = Math.hypot(far.x - J.x, far.y - J.y);
    if (bl < 1e-6) return null;
    const a = e ? { x: -ux, y: -uy } : { x: ux, y: uy }, b = { x: (far.x - J.x) / bl, y: (far.y - J.y) / bl }, nb = { x: -b.y, y: b.x };
    const cross = a.x * b.y - a.y * b.x;
    if (Math.abs(cross) < 0.1) return a.x * b.x + a.y * b.y < 0 ? [e ? L : 0, e ? L : 0] : null;
    const sg = Math.sign(nL.x * b.x + nL.y * b.y), sg2 = Math.sign(nb.x * a.x + nb.y * a.y);
    /** s donde la cara de este muro a n del eje corta la cara del otro a m' del suyo */
    const at = (n: number, mo: number) => {
      const rx = mo * nb.x - n * nL.x, ry = mo * nb.y - n * nL.y, det = -cross;
      const lam = (rx * -b.y + ry * b.x) / det;
      return e ? L - lam : lam;
    };
    // la cara del lado del otro muro (interior) corta su cara interior; la de fuera, su cara de fuera
    const inner = at(sg * t, sg2 * (o.thick / 2)), outer = at(-sg * t, -sg2 * (o.thick / 2));
    return sg > 0 ? [outer, inner] : [inner, outer];
  };
  return [end(0), end(1)];
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

/**
 * Extensión del dibujo con 1.5 m de margen. Con robust=true no cuenta los puntos sueltos que quedan
 * lejos del resto (para encuadrar un plano importado con restos olvidados a kilómetros).
 */
export function bounds(m: Model, extra: Pt[] = [], robust = false): Bounds {
  const pts: Pt[] = [];
  const add = (x: number, y: number) => { pts.push({ x, y }); };
  for (const s of [...m.walls, ...m.lines, ...m.dims, ...(m.roofs ?? []), ...(m.stairs ?? [])]) { add(s.x1, s.y1); add(s.x2, s.y2); }
  for (const sl of m.slabs ?? []) for (const p of sl.pts) add(p.x, p.y);
  for (const h of m.hatches ?? []) for (const q of h.loops) for (const p of q) add(p.x, p.y);
  for (const f of m.furniture ?? []) add(f.x, f.y);
  for (const t of m.texts ?? []) for (const p of textBox(t)) add(p.x, p.y);
  for (const mk of m.marks ?? []) for (const p of markPts(mk)) add(p.x, p.y);
  for (const p of extra) add(p.x, p.y);
  let b = robust ? robustBox(pts) : null;
  if (!robust && pts.length) {
    b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const p of pts) { b.x0 = Math.min(b.x0, p.x); b.y0 = Math.min(b.y0, p.y); b.x1 = Math.max(b.x1, p.x); b.y1 = Math.max(b.y1, p.y); }
  }
  if (!b || !isFinite(b.x0)) return { x0: -5, y0: -4, x1: 5, y1: 4 };
  const mg = robust ? Math.max(0.05, Math.min(1.5, Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.05)) : 1.5;
  return { x0: b.x0 - mg, y0: b.y0 - mg, x1: b.x1 + mg, y1: b.y1 + mg };
}

/** Puntos de lo que se construye (muros, losas, cubiertas, escaleras, columnas, muebles…), sin líneas, cotas ni textos. */
export function solidPts(m: Model): Pt[] {
  const pts: Pt[] = [];
  for (const s of [...m.walls, ...(m.roofs ?? []), ...(m.stairs ?? []), ...(m.decks ?? [])]) pts.push({ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
  for (const sl of m.slabs ?? []) pts.push(...sl.pts);
  for (const c of m.columns ?? []) pts.push(c);
  for (const f of [...(m.furniture ?? []), ...(m.fixtures ?? [])]) pts.push(f);
  return pts;
}

/**
 * Extensión de una planta para las láminas: si ya hay algo construido, eso y lo que quede a menos de 5 m
 * (cotas, textos, líneas), para que un DWG o PDF importado de fondo, con su marco y sus restos lejanos,
 * no deje el edificio diminuto o fuera de la hoja.
 */
export function sheetBounds(m: Model): Bounds {
  const pts = solidPts(m);
  if (!pts.length) return bounds(m, [], true);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y), near = 5;
  const s = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  const all = annoPts(m);
  const b = { ...s };
  for (const p of all) if (p.x > s.x0 - near && p.x < s.x1 + near && p.y > s.y0 - near && p.y < s.y1 + near) {
    b.x0 = Math.min(b.x0, p.x); b.y0 = Math.min(b.y0, p.y); b.x1 = Math.max(b.x1, p.x); b.y1 = Math.max(b.y1, p.y);
  }
  const mg = 1.5;
  return { x0: b.x0 - mg, y0: b.y0 - mg, x1: b.x1 + mg, y1: b.y1 + mg };
}

/** Puntos de las anotaciones: líneas, cotas, sombreados y textos. */
function annoPts(m: Model): Pt[] {
  const pts: Pt[] = [];
  for (const s of [...m.lines, ...m.dims]) pts.push({ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
  for (const h of m.hatches ?? []) for (const q of h.loops) pts.push(...q);
  for (const t of m.texts ?? []) pts.push(...textBox(t));
  for (const mk of m.marks ?? []) pts.push(...markPts(mk));
  return pts;
}

/**
 * Extensión del dibujo sin los puntos sueltos que quedan lejos (el 2 % de cada lado):
 * en muchos DWG hay restos olvidados a kilómetros que harían ver el plano diminuto.
 */
export function robustBox(pts: Pt[]): { x0: number; y0: number; x1: number; y1: number } | null {
  if (!pts.length) return null;
  const xs = pts.map((p) => p.x).sort((a, b) => a - b), ys = pts.map((p) => p.y).sort((a, b) => a - b);
  const k = pts.length >= 50 ? Math.floor(pts.length * 0.02) : 0, n = pts.length - 1 - k;
  return { x0: xs[k], y0: ys[k], x1: xs[n], y1: ys[n] };
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

/** Pretil de azotea por omisión: altura sobre la losa y grueso (tabique con su aplanado). */
export const PARAPET = { h: 0.6, t: 0.15 };

/**
 * Pretil de una azotea: contorno exterior (el borde de la losa, con su volado) e interior, cota de arranque
 * (lecho alto de la losa, sobre la cota del nivel) y altura. null si la cubierta no es plana o no lleva pretil.
 */
export function parapet(r: Roof) {
  if (r.kind !== "flat") return null;
  const h = r.parapet ?? PARAPET.h, t = PARAPET.t, outer = roofGeom(r).outline;
  const x0 = outer[0].x, y0 = outer[0].y, x1 = outer[2].x, y1 = outer[2].y;
  if (h < 0.01 || x1 - x0 < 3 * t || y1 - y0 < 3 * t) return null;
  const inner = [{ x: x0 + t, y: y0 + t }, { x: x1 - t, y: y0 + t }, { x: x1 - t, y: y1 - t }, { x: x0 + t, y: y1 - t }];
  return { h, t, outer, inner, z: r.base + r.thick };
}

/**
 * true si la cumbrera (o, en la de un agua, la línea del alero) corre en x. La elige el usuario con dir o drain;
 * sin dato va en la dirección larga.
 */
export function roofAlongX(r: Roof): boolean {
  if (r.kind === "shed") return (r.drain ?? 2) % 2 === 0;
  if (r.dir) return r.dir === "x";
  return Math.abs(r.x2 - r.x1) >= Math.abs(r.y2 - r.y1);
}

/** De un agua: true si el alero bajo queda del lado V1 (abajo o a la derecha). */
export const shedLowV1 = (r: Roof) => { const d = r.drain ?? 2; return d === 1 || d === 2; };

/**
 * Geometría de una cubierta rectangular. La cumbrera va en la dirección elegida (sin dato, la larga).
 * A dos aguas cae hacia los lados paralelos a la cumbrera; a cuatro aguas, hacia los cuatro lados;
 * de un agua, hacia el lado elegido, con un muro piñón en el lado alto.
 */
/** Flechas de la pendiente en planta, de arriba abajo: una por faldón largo (o la del único, en la de un agua). */
export function roofSlopes(r: Roof): [Pt, Pt][] {
  if (r.kind === "flat") return [];
  const [a, , c] = roofGeom(r).outline, cx = (a.x + c.x) / 2, cy = (a.y + c.y) / 2, ax = roofAlongX(r);
  const h = (ax ? c.y - a.y : c.x - a.x) / 2, n = ax ? { x: 0, y: 1 } : { x: 1, y: 0 };
  const at = (k: number): Pt => ({ x: cx + n.x * h * k, y: cy + n.y * h * k });
  if (r.kind === "shed") { const s = shedLowV1(r) ? 1 : -1; return [[at(-0.55 * s), at(0.55 * s)]]; }
  return [[at(-0.2), at(-0.75)], [at(0.2), at(0.75)]];
}

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
  // trabajamos en ejes locales: u a lo largo de la cumbrera, v a través
  const alongX = roofAlongX(r);
  const U0 = alongX ? x0 : y0, U1 = alongX ? x1 : y1, V0 = alongX ? y0 : x0, V1 = alongX ? y1 : x1;
  const half = (V1 - V0) / 2, vm = (V0 + V1) / 2, zt = z0 + half * tan;
  const P = (u: number, v: number, z: number): P3 => (alongX ? { x: u, y: v, z } : { x: v, y: u, z });
  const pt = (q: P3): Pt => ({ x: q.x, y: q.y });
  const top = (f: P3[]) => f.filter((q, i) => i === 0 || Math.hypot(q.x - f[i - 1].x, q.y - f[i - 1].y) > 1e-6).map((q) => ({ ...q, z: q.z + lift }));
  if (r.kind === "shed") {
    // un solo faldón del alero bajo al alto; los hastiales de los extremos son trapecios y el lado alto lleva muro
    const lowV1 = shedLowV1(r), dv = (v: number) => (lowV1 ? V1 - v : v - V0), Z = (v: number) => z0 + dv(v) * tan;
    const ua = U0 + o, ub = U1 - o, va = V0 + o, vb = V1 - o, vh = lowV1 ? va : vb, vhi = lowV1 ? V0 : V1;
    const face = [P(U0, V0, Z(V0)), P(U1, V0, Z(V0)), P(U1, V1, Z(V1)), P(U0, V1, Z(V1))];
    const gables = [ua, ub].map((u) => [P(u, va, r.base), P(u, vb, r.base), P(u, vb, Z(vb) + lift), P(u, va, Z(va) + lift)]);
    gables.push([P(ua, vh, r.base), P(ub, vh, r.base), P(ub, vh, Z(vh) + lift), P(ua, vh, Z(vh) + lift)]);
    return { outline, ridges: [], faces: [top(face)], gables, top: Z(vhi) + lift };
  }
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
  return { outline, ridges, faces: faces.map(top), gables, top: zt + lift };
}


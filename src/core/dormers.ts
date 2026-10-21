// Buhardillas (dormers): frente vertical con ventana, costados triangulares y techo a dos aguas o de un agua
// que muere en el faldón. Todo en el mismo sistema que roofGeom: z sobre la cota del nivel, cara superior.
import type { P3, Pt } from "./geometry";
import type { Dormer, Roof } from "./model";

export const DORMER = { w: 1.4, h: 1.2, set: 0.3, minPitch: 15, wall: 0.1 };

/** Prisma de un muro vertical: la cara dada, la de atrás desplazada t según n y los cantos. */
export function thicken(f: P3[], n: { x: number; y: number }, t: number): P3[][] {
  const back = f.map((q) => ({ x: q.x + n.x * t, y: q.y + n.y * t, z: q.z }));
  const out = [f, [...back].reverse()];
  for (let i = 0; i < f.length; i++) { const j = (i + 1) % f.length; out.push([f[j], f[i], back[i], back[j]]); }
  return out;
}

/** Marco de 5 cm alrededor de un vidrio rectangular (a, b, c, d en orden), un poco por delante del muro. */
function frameAround(g: P3[], n: { x: number; y: number }): P3[][] {
  const [a, b, , d] = g, k = 0.05;
  const lerp = (p: P3, q: P3, s: number): P3 => ({ x: p.x + (q.x - p.x) * s, y: p.y + (q.y - p.y) * s, z: p.z + (q.z - p.z) * s });
  const W = Math.hypot(b.x - a.x, b.y - a.y), H = d.z - a.z;
  if (W < 3 * k || H < 3 * k) return [];
  const at = (s: number, r: number) => { const p = lerp(a, b, s / W); return { ...p, z: a.z + r }; };
  const bar = (s0: number, s1: number, r0: number, r1: number) => thicken([at(s0, r0), at(s1, r0), at(s1, r1), at(s0, r1)].map((q) => ({ ...q, x: q.x - n.x * 0.01, y: q.y - n.y * 0.01 })), n, DORMER.wall * 0.6);
  return [...bar(0, W, 0, k), ...bar(0, W, H - k, H), ...bar(0, k, k, H - k), ...bar(W - k, W, k, H - k)];
}

/** Ventana del frente: ancho, antepecho y dintel; sin dato, la de siempre (todo el ancho menos 40 cm). */
export function frontWindow(d: Dormer, zf: number, ze: number) {
  if (d.win === null) return null;
  const head = ze - 0.12, maxH = head - (zf + 0.15);
  const w = Math.min(d.win?.w ?? d.w - 0.4, d.w - 0.25), h = Math.min(d.win?.h ?? maxH, maxH);
  if (w < 0.3 || h < 0.3) return null;
  return { w, sill: head - h, head, style: d.win?.style ?? "fixed" };
}

/** Ventana de los costados (la misma en los dos): de t1 a t2 desde el paño, junto al frente. */
export function sideWindow(d: Dormer, zf: number, ze: number, tan: number) {
  if (!d.sideWin) return null;
  const t1 = d.set + DORMER.wall + 0.08, t2 = t1 + d.sideWin.w, head = ze - 0.12, floor = zf + (t2 - d.set) * tan + 0.1;
  const sill = Math.max(floor, head - d.sideWin.h);
  if (head - sill < 0.25 || d.sideWin.w < 0.2) return null;
  return { t1, t2, sill, head, style: d.sideWin.style };
}
/** Vuelo del techo de la buhardilla al frente y a los lados. */
const FO = 0.15, SO = 0.1;

/** Ejes locales de una cubierta inclinada (los mismos que roofGeom): u a lo largo de la cumbrera, v a través. */
export function roofAxes(r: Roof) {
  const o = r.overhang;
  const x0 = Math.min(r.x1, r.x2) - o, x1 = Math.max(r.x1, r.x2) + o, y0 = Math.min(r.y1, r.y2) - o, y1 = Math.max(r.y1, r.y2) + o;
  const alongX = x1 - x0 >= y1 - y0;
  const U0 = alongX ? x0 : y0, U1 = alongX ? x1 : y1, V0 = alongX ? y0 : x0, V1 = alongX ? y1 : x1;
  const tan = Math.tan((Math.max(0, Math.min(75, r.pitch)) * Math.PI) / 180);
  const lift = r.thick / Math.cos(Math.atan(tan));
  /** Distancia del paño del muro a la cumbrera */
  const toRidge = (V1 - V0) / 2 - o;
  return { o, alongX, U0, U1, V0, V1, tan, lift, toRidge, hip: r.kind === "hip" };
}

export interface DormerGeom {
  /** Techo (cara superior) */
  roof: P3[][];
  /** Frente (alrededor de la ventana) y costados */
  walls: P3[][];
  /** Vidrios de las ventanas, con el estilo de cada uno, y sus marcos */
  glass: P3[][];
  styles: string[];
  frames: P3[][];
  /** Contorno en planta y aristas (cumbrera y limahoyas) */
  outline: Pt[];
  lines: [Pt, Pt][];
}

/** Geometría de la buhardilla, o null si no cabe en el faldón (pendiente baja, demasiado alta o fuera de él). */
export function dormerGeom(r: Roof, d: Dormer): DormerGeom | null {
  if (r.kind === "flat" || r.pitch < DORMER.minPitch) return null;
  const A = roofAxes(r), { tan, lift } = A, base = r.base;
  const um = (A.U0 + A.U1) / 2 + d.u, u0 = um - d.w / 2, u1 = um + d.w / 2;
  // punto en planta a la distancia t del paño del muro, en el faldón de la buhardilla
  const P = (u: number, t: number, z: number): P3 => {
    const v = d.side ? A.V1 - A.o - t : A.V0 + A.o + t;
    return A.alongX ? { x: u, y: v, z } : { x: v, y: u, z };
  };
  const pt = (q: P3): Pt => ({ x: q.x, y: q.y });
  /** Distancia desde el paño a la que el faldón alcanza la altura z (cara superior). */
  const at = (z: number) => (z - base - lift) / tan;
  const zf = base + d.set * tan + lift, ze = zf + d.h;
  let tops: number;
  const roof: P3[][] = [], lines: [Pt, Pt][] = [];
  let outline: Pt[];
  if (d.kind === "gable") {
    const zr = ze + (d.w / 2) * tan, dr = at(zr), zs = ze - SO * tan, ds = at(zs);
    tops = dr;
    const a = P(u0 - SO, d.set - FO, zs + lift), b = P(um, d.set - FO, zr + lift), c = P(um, dr + lift / tan, zr + lift), e = P(u0 - SO, ds + lift / tan, zs + lift);
    const a2 = P(u1 + SO, d.set - FO, zs + lift), e2 = P(u1 + SO, ds + lift / tan, zs + lift);
    roof.push([a, b, c, e], [b, a2, e2, c]);
    outline = [a, a2, e2, c, e].map(pt);
    lines.push([pt(b), pt(c)], [pt(e), pt(c)], [pt(e2), pt(c)]);
  } else {
    const ts = tan / 3, dm = d.set + d.h / (tan - ts), zm = ze + (dm - d.set) * ts;
    tops = dm;
    const zF = ze - FO * ts;
    const a = P(u0 - SO, d.set - FO, zF + lift), b = P(u1 + SO, d.set - FO, zF + lift), c = P(u1 + SO, dm, zm + lift), e = P(u0 - SO, dm, zm + lift);
    roof.push([a, b, c, e]);
    outline = [a, b, c, e].map(pt);
    lines.push([pt(e), pt(c)]);
  }
  // cabe si no pasa de la cumbrera ni de los extremos del faldón (en la de cuatro aguas, de las limatesas)
  const reach = tops + 0.15, side = A.hip ? A.o + reach : 0;
  if (reach > A.toRidge || u0 - SO < A.U0 + side + 0.05 || u1 + SO > A.U1 - side - 0.05) return null;
  // muros con espesor: el frente hacia la cumbrera y los costados hacia dentro, con los huecos de sus ventanas
  const walls: P3[][] = [], glass: P3[][] = [], frames: P3[][] = [], styles: string[] = [];
  const dirOf = (q: P3, o: P3) => { const L = Math.hypot(q.x - o.x, q.y - o.y) || 1; return { x: (q.x - o.x) / L, y: (q.y - o.y) / L }; };
  const nT = dirOf(P(um, d.set + 1, 0), P(um, d.set, 0)), nU = dirOf(P(um + 1, d.set, 0), P(um, d.set, 0));
  const solid = (f: P3[], n: { x: number; y: number }, t = DORMER.wall) => walls.push(...thicken(f, n, t));
  const pane = (g: P3[], n: { x: number; y: number }, style: string) => {
    glass.push(g.map((q) => ({ ...q, x: q.x + n.x * DORMER.wall / 2, y: q.y + n.y * DORMER.wall / 2 })));
    styles.push(style);
    frames.push(...frameAround(g, n));
  };
  const F = (u: number, z: number) => P(u, d.set, z);
  const rect = (ua: number, ub: number, za: number, zb: number) => [F(ua, za), F(ub, za), F(ub, zb), F(ua, zb)];
  const fw = frontWindow(d, zf, ze);
  if (fw) {
    const wa = um - fw.w / 2, wb = um + fw.w / 2;
    for (const f of [rect(u0, u1, zf, fw.sill), rect(u0, wa, fw.sill, fw.head), rect(wb, u1, fw.sill, fw.head), rect(u0, u1, fw.head, ze)]) solid(f, nT);
    pane(rect(wa, wb, fw.sill, fw.head), nT, fw.style);
  } else solid(rect(u0, u1, zf, ze), nT);
  if (d.kind === "gable") solid([F(u0, ze), F(u1, ze), F(um, ze + (d.w / 2) * tan)], nT);
  // costados: mueren en el faldón (en la de dos aguas a la altura del alero, en la de un agua al fondo del techo)
  const ts = d.kind === "gable" ? 0 : tan / 3, dTop = d.kind === "gable" ? at(ze) : tops;
  const zRoof = (t: number) => zf + (t - d.set) * tan, zTop = (t: number) => ze + (t - d.set) * ts;
  const sw = sideWindow(d, zf, ze, tan);
  for (const [u, sg] of [[u0, 1], [u1, -1]] as const) {
    const n = { x: nU.x * sg, y: nU.y * sg }, C = (t: number, z: number) => P(u, t, z);
    if (!sw) { solid([C(d.set, zf), C(dTop, zTop(dTop)), C(d.set, ze)], n); continue; }
    const { t1, t2, sill, head } = sw;
    solid([C(d.set, zf), C(t1, zRoof(t1)), C(t1, zTop(t1)), C(d.set, ze)], n);
    solid([C(t1, zRoof(t1)), C(t2, zRoof(t2)), C(t2, sill), C(t1, sill)], n);
    solid([C(t1, head), C(t2, head), C(t2, zTop(t2)), C(t1, zTop(t1))], n);
    solid([C(t2, zRoof(t2)), C(dTop, zTop(dTop)), C(t2, zTop(t2))], n);
    pane([C(t1, sill), C(t2, sill), C(t2, head), C(t1, head)], n, sw.style);
  }
  return { roof, walls, glass, styles, frames, outline, lines };
}

/** Faldón y centro (medido desde el centro de la cubierta) de una buhardilla para el punto p de la planta, o null si p no cae en un faldón largo. */
export function dormerAt(r: Roof, p: Pt): { u: number; side: 0 | 1 } | null {
  if (r.kind === "flat") return null;
  const A = roofAxes(r), u = A.alongX ? p.x : p.y, v = A.alongX ? p.y : p.x;
  if (u < A.U0 || u > A.U1 || v < A.V0 || v > A.V1) return null;
  return { u: u - (A.U0 + A.U1) / 2, side: v < (A.V0 + A.V1) / 2 ? 0 : 1 };
}

/** Punto de la planta en el centro del frente de la buhardilla (para seguirla al mover o girar la cubierta). */
export function dormerCenter(r: Roof, d: Dormer): Pt {
  const A = roofAxes(r), u = (A.U0 + A.U1) / 2 + d.u, v = d.side ? A.V1 - A.o - d.set : A.V0 + A.o + d.set;
  return A.alongX ? { x: u, y: v } : { x: v, y: u };
}

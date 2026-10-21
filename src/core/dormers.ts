// Buhardillas (dormers): frente vertical con ventana, costados triangulares y techo a dos aguas o de un agua
// que muere en el faldón. Todo en el mismo sistema que roofGeom: z sobre la cota del nivel, cara superior.
import type { P3, Pt } from "./geometry";
import type { Dormer, Roof } from "./model";

export const DORMER = { w: 1.4, h: 1.2, set: 0.3, minPitch: 15 };
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
  /** Vidrio de la ventana */
  glass: P3[][];
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
  // frente con el hueco de la ventana, costados triangulares hasta el faldón
  const F = (u: number, z: number, t = d.set) => P(u, t, z);
  const rect = (ua: number, ub: number, za: number, zb: number, t?: number) => [F(ua, za, t), F(ub, za, t), F(ub, zb, t), F(ua, zb, t)];
  const walls: P3[][] = [], glass: P3[][] = [];
  const ww = Math.max(0.4, d.w - 0.4), wa = um - ww / 2, wb = um + ww / 2, sill = zf + 0.15, head = ze - 0.12;
  if (head - sill > 0.3) {
    walls.push(rect(u0, u1, zf, sill), rect(u0, wa, sill, head), rect(wb, u1, sill, head), rect(u0, u1, head, ze));
    glass.push(rect(wa, wb, sill, head, d.set + 0.04));
  } else walls.push(rect(u0, u1, zf, ze));
  if (d.kind === "gable") walls.push([F(u0, ze), F(u1, ze), F(um, ze + (d.w / 2) * tan)]);
  // el costado muere en el faldón: en la de dos aguas a la altura del alero, en la de un agua al fondo del techo
  const dTop = d.kind === "gable" ? at(ze) : tops, zTop = d.kind === "gable" ? ze : ze + (tops - d.set) * (tan / 3);
  for (const u of [u0, u1]) walls.push([P(u, d.set, zf), P(u, d.set, ze), P(u, dTop, zTop)]);
  return { roof, walls, glass, outline, lines };
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

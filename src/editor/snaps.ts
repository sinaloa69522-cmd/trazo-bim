import { distSeg, roofGeom, type Pt } from "../core/geometry";
import type { Model } from "../core/model";
import { furnitureOutline } from "../core/furniture";
import { stairGeom } from "../core/stairs";
import { deckGeom } from "../core/decks";

/** Modos de referencia a objetos, como los de AutoCAD. */
export type SnapKind = "end" | "mid" | "int" | "cen" | "ins" | "perp" | "near";

export const SNAP_MODES: { id: SnapKind; name: string; cmd: string[] }[] = [
  { id: "end", name: "Punto final", cmd: ["FIN", "END"] },
  { id: "mid", name: "Punto medio", cmd: ["MED", "MID"] },
  { id: "int", name: "Intersección", cmd: ["INT"] },
  { id: "cen", name: "Centro", cmd: ["CEN"] },
  { id: "ins", name: "Inserción", cmd: ["INS", "NOD"] },
  { id: "perp", name: "Perpendicular", cmd: ["PER"] },
  { id: "near", name: "Cercano", cmd: ["CER", "NEA"] },
];
export const SNAP_NAME = Object.fromEntries(SNAP_MODES.map((s) => [s.id, s.name])) as Record<SnapKind, string>;
export const DEFAULT_SNAPS: SnapKind[] = ["end", "mid", "int", "cen", "ins"];
/** Incrementos de ángulo polar habituales. */
export const POLAR_INCS = [90, 45, 30, 22.5, 15, 10, 5];

/** Línea de alineación que se dibuja de trazos: pasa por o con ángulo ang (radianes, en coordenadas del modelo). */
export interface Guide { o: Pt; ang: number }
export interface SnapPt extends Pt {
  kind: SnapKind | null;
  guides?: Guide[];
  /** Rótulo junto al cursor: nombre de la referencia o rastreo polar */
  tip?: string;
}

type Owner = object;
interface SSeg { x1: number; y1: number; x2: number; y2: number; o: Owner; ends?: boolean }
interface SPt { x: number; y: number; k: "end" | "cen" | "ins"; o: Owner }
export interface SnapGeo { segs: SSeg[]; pts: SPt[] }

/** Segmentos y puntos notables del nivel a los que se puede enganchar el cursor. */
export function snapGeometry(m: Model): SnapGeo {
  const segs: SSeg[] = [], pts: SPt[] = [];
  const ring = (r: Pt[], o: Owner, closed = true) => {
    for (let i = 0; i < r.length - (closed ? 0 : 1); i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, o, ends: true });
    }
  };
  const joined = (x: number, y: number, self: object) => m.walls.some((o) => o !== self && (Math.hypot(o.x1 - x, o.y1 - y) < 0.01 || Math.hypot(o.x2 - x, o.y2 - y) < 0.01));
  for (const w of m.walls) {
    segs.push({ ...pick(w), o: w, ends: true });
    // caras del muro: se alargan medio espesor en los encuentros para que se corten en las esquinas
    const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    if (L < 1e-9 || w.thick <= 0) continue;
    const ux = (w.x2 - w.x1) / L, uy = (w.y2 - w.y1) / L, h = w.thick / 2;
    const e0 = joined(w.x1, w.y1, w) ? h : 0, e1 = joined(w.x2, w.y2, w) ? h : 0;
    for (const s of [-1, 1]) {
      const nx = -uy * h * s, ny = ux * h * s;
      segs.push({ x1: w.x1 - ux * e0 + nx, y1: w.y1 - uy * e0 + ny, x2: w.x2 + ux * e1 + nx, y2: w.y2 + uy * e1 + ny, o: w });
      // esquinas de un extremo libre
      if (!e0) pts.push({ x: w.x1 + nx, y: w.y1 + ny, k: "end", o: w });
      if (!e1) pts.push({ x: w.x2 + nx, y: w.y2 + ny, k: "end", o: w });
    }
  }
  for (const l of m.lines) segs.push({ ...pick(l), o: l, ends: true });
  for (const sl of m.slabs) for (const r of [sl.pts, ...sl.holes]) ring(r, sl);
  for (const h of m.hatches) for (const r of h.loops) ring(r, h);
  for (const r of m.runs) ring(r.pts, r, false);
  for (const c of m.columns) {
    const x0 = c.x - c.w / 2, x1 = c.x + c.w / 2, y0 = c.y - c.d / 2, y1 = c.y + c.d / 2;
    ring([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], c);
    pts.push({ x: c.x, y: c.y, k: "cen", o: c });
  }
  for (const r of m.roofs) { try { ring(roofGeom(r).outline, r); } catch { /* cubierta degenerada */ } }
  for (const st of m.stairs) { try { ring(stairGeom(st).outline, st); } catch { /* escalera degenerada */ } }
  for (const dk of m.decks) {
    try { const g = deckGeom(dk, m.walls); ring([{ x: g.x0, y: g.y0 }, { x: g.x1, y: g.y0 }, { x: g.x1, y: g.y1 }, { x: g.x0, y: g.y1 }], dk); } catch { /* deck degenerado */ }
  }
  for (const f of m.furniture) {
    try { const o = furnitureOutline(f); ring(o, f); pts.push({ x: f.x, y: f.y, k: "ins", o: f }); } catch { /* mueble desconocido */ }
  }
  for (const f of m.fixtures) pts.push({ x: f.x, y: f.y, k: "ins", o: f });
  for (const t of m.texts) pts.push({ x: t.x, y: t.y, k: "ins", o: t });
  for (const mk of m.marks) {
    pts.push({ x: mk.x, y: mk.y, k: "ins", o: mk });
    if (mk.kind === "detalle" && mk.ax !== undefined && mk.ay !== undefined) pts.push({ x: mk.ax, y: mk.ay, k: "cen", o: mk });
  }
  return { segs, pts };
}
const pick = (s: { x1: number; y1: number; x2: number; y2: number }) => ({ x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 });

export interface SnapOpts {
  /** Tolerancia de captura en metros de modelo */
  tol: number;
  osnap: boolean;
  modes: ReadonlySet<SnapKind>;
  /** Último punto marcado (para ortogonal, polar y perpendicular) */
  from: Pt | null;
  ortho: boolean;
  polar: boolean;
  polarInc: number;
  /** false en herramientas donde no tiene sentido forzar la dirección */
  constrain: boolean;
  otrack: boolean;
  tracked: Pt[];
  /** Redondeo de forzcursor; null sin forzado */
  round: ((v: number) => number) | null;
  skip?: Set<object>;
  /** Puntos extra que cuentan como punto final (vértices del dibujo en curso) */
  extra?: Pt[];
}

const lineHit = (p: Pt, o: Pt, ang: number) => {
  const ux = Math.cos(ang), uy = Math.sin(ang), t = (p.x - o.x) * ux + (p.y - o.y) * uy;
  return { t, d: Math.abs(-(p.x - o.x) * uy + (p.y - o.y) * ux) };
};
function cross(a: Guide, b: Guide): Pt | null {
  const ax = Math.cos(a.ang), ay = Math.sin(a.ang), bx = Math.cos(b.ang), by = Math.sin(b.ang);
  const den = ax * by - ay * bx;
  if (Math.abs(den) < 1e-6) return null;
  const t = ((b.o.x - a.o.x) * by - (b.o.y - a.o.y) * bx) / den;
  return { x: a.o.x + ax * t, y: a.o.y + ay * t };
}
function segCross(a: SSeg, b: SSeg): Pt | null {
  const rx = a.x2 - a.x1, ry = a.y2 - a.y1, sx = b.x2 - b.x1, sy = b.y2 - b.y1, den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qx = b.x1 - a.x1, qy = b.y1 - a.y1, t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den, e = 1e-6;
  return t >= -e && t <= 1 + e && u >= -e && u <= 1 + e ? { x: a.x1 + rx * t, y: a.y1 + ry * t } : null;
}
/** Ángulo para el rótulo: antihorario desde +X como se ve en pantalla (y del modelo hacia abajo). */
export const screenDeg = (ang: number) => { let d = (-ang * 180) / Math.PI; d = ((d % 360) + 360) % 360; return Math.round(d * 100) / 100; };

/** Referencia a objetos: el punto notable más cercano al cursor dentro de la tolerancia. */
export function objectSnap(geo: SnapGeo, q: Pt, o: Pick<SnapOpts, "tol" | "modes" | "from" | "skip" | "extra">): SnapPt | null {
  const { tol, modes } = o, live = o.skip ? geo.segs.filter((s) => !o.skip!.has(s.o)) : geo.segs;
  let best = tol * 1.1, r: SnapPt | null = null;
  // a igual distancia ganan el punto final y la intersección sobre el punto medio
  const bias: Record<string, number> = { end: 0, int: 0, cen: 0.02, ins: 0.02, mid: 0.05 };
  const test = (x: number, y: number, kind: SnapKind) => {
    if (!modes.has(kind)) return;
    const d = Math.hypot(x - q.x, y - q.y);
    if (d > tol) return;
    const score = d + (bias[kind] ?? 0) * tol;
    if (score < best) { best = score; r = { x, y, kind }; }
  };
  const near = live.filter((s) => distSeg(q.x, q.y, s.x1, s.y1, s.x2, s.y2).d <= tol);
  for (const s of near) {
    if (s.ends) { test(s.x1, s.y1, "end"); test(s.x2, s.y2, "end"); test((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, "mid"); }
  }
  for (const p of geo.pts) if (!o.skip?.has(p.o)) test(p.x, p.y, p.k);
  for (const p of o.extra ?? []) test(p.x, p.y, "end");
  if (modes.has("int")) for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
    if (near[i].o === near[j].o && !near[i].ends) continue;
    const x = segCross(near[i], near[j]);
    if (x) test(x.x, x.y, "int");
  }
  if (r) return r;
  // perpendicular desde el último punto, sobre el elemento bajo el cursor
  if (modes.has("perp") && o.from) {
    let bd = tol;
    for (const s of near) {
      const f = distSeg(o.from.x, o.from.y, s.x1, s.y1, s.x2, s.y2), L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
      if (L < 1e-9 || f.t <= 1e-6 || f.t >= 1 - 1e-6) continue;
      const x = s.x1 + (s.x2 - s.x1) * f.t, y = s.y1 + (s.y2 - s.y1) * f.t;
      if (Math.hypot(x - o.from.x, y - o.from.y) < 1e-6) continue;
      const d = distSeg(q.x, q.y, s.x1, s.y1, s.x2, s.y2).d;
      if (d <= bd) { bd = d; r = { x, y, kind: "perp" }; }
    }
    if (r) return r;
  }
  if (modes.has("near") && near.length) {
    let bd = Infinity;
    for (const s of near) {
      const f = distSeg(q.x, q.y, s.x1, s.y1, s.x2, s.y2);
      if (f.d < bd) { bd = f.d; r = { x: s.x1 + (s.x2 - s.x1) * f.t, y: s.y1 + (s.y2 - s.y1) * f.t, kind: "near" }; }
    }
  }
  return r;
}

/**
 * Punto final del cursor: referencia a objetos y, si no hay, ortogonal o polar,
 * rastreo desde los puntos adquiridos y forzcursor.
 */
export function resolveSnap(geo: SnapGeo, wx: number, wy: number, o: SnapOpts): SnapPt {
  const q = { x: wx, y: wy };
  if (o.osnap) {
    const r = objectSnap(geo, q, o);
    if (r) return { ...r, tip: SNAP_NAME[r.kind!] };
  }
  const from = o.constrain ? o.from : null, tolT = o.tol * 0.7;
  const rnd = (v: number) => (o.round ? o.round(v) : v);
  // líneas de rastreo horizontales y verticales por los puntos adquiridos
  const tracks: (Guide & { d: number; t: number; src: "track" })[] = [];
  if (o.otrack) for (const p of o.tracked) for (const ang of [0, Math.PI / 2]) {
    const h = lineHit(q, p, ang);
    if (h.d <= tolT && Math.hypot(q.x - p.x, q.y - p.y) > o.tol) tracks.push({ o: p, ang, d: h.d, t: h.t, src: "track" });
  }
  tracks.sort((a, b) => a.d - b.d);

  // ortogonal: dirección obligada; el rastreo solo fija dónde se corta con ella
  if (from && o.ortho && !o.polar) {
    const horiz = Math.abs(q.x - from.x) >= Math.abs(q.y - from.y);
    const g: Guide = { o: from, ang: horiz ? 0 : Math.PI / 2 };
    for (const t of tracks) {
      const x = cross(g, t);
      if (x && Math.hypot(x.x - q.x, x.y - q.y) <= o.tol * 1.5) return { ...x, kind: null, guides: [g, t], tip: "Ortogonal · rastreo" };
    }
    return horiz ? { x: from.x + rnd(q.x - from.x), y: from.y, kind: null } : { x: from.x, y: from.y + rnd(q.y - from.y), kind: null };
  }
  // polar: el rayo de ángulo múltiplo del incremento más cercano al cursor
  let polar: (Guide & { d: number; t: number }) | null = null;
  if (from && o.polar && o.polarInc > 0 && Math.hypot(q.x - from.x, q.y - from.y) > o.tol) {
    const step = (o.polarInc * Math.PI) / 180, a = Math.atan2(q.y - from.y, q.x - from.x), ang = Math.round(a / step) * step;
    const h = lineHit(q, from, ang);
    if (h.d <= tolT * 1.5 && h.t > 0) polar = { o: from, ang, ...h };
  }
  const lines = [...(polar ? [polar] : []), ...tracks];
  // dos alineaciones a la vez: su cruce
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const x = cross(lines[i], lines[j]);
    if (x && Math.hypot(x.x - q.x, x.y - q.y) <= o.tol * 1.5) {
      const pd = polar && (lines[i] === polar || lines[j] === polar) ? `Polar ∠${screenDeg(polar.ang)}° · rastreo` : "Rastreo";
      return { ...x, kind: null, guides: [lines[i], lines[j]], tip: pd };
    }
  }
  if (polar) {
    const t = rnd(polar.t);
    return { x: from!.x + Math.cos(polar.ang) * t, y: from!.y + Math.sin(polar.ang) * t, kind: null, guides: [polar], tip: `Polar ${Math.abs(t).toFixed(2)} ∠${screenDeg(polar.ang)}°` };
  }
  if (tracks.length) {
    const g = tracks[0], t = rnd(g.t);
    return { x: g.o.x + Math.cos(g.ang) * t, y: g.o.y + Math.sin(g.ang) * t, kind: null, guides: [g], tip: "Rastreo" };
  }
  return o.round ? { x: o.round(q.x), y: o.round(q.y), kind: null } : { x: q.x, y: q.y, kind: null };
}

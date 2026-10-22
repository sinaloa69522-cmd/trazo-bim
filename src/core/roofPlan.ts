// Datos de la planta de azotea: nivel que la lleva, superficie, pretil, huecos (cubo de escalera) y desagüe.
import { parapet, pointInPolygon, polygonArea, roofAlongX, roofGeom, type Pt } from "./geometry";
import { roofFinish } from "./finishes";
import type { Level, Project, Roof } from "./model";
import { stairGeom } from "./stairs";

/** Pendiente del relleno de la azotea hacia las gárgolas. */
export const ROOF_SLOPE = 0.02;

/** Nivel de la lámina de azotea: el más alto con cubierta (o el último si no hay ninguna). */
export function roofLevel(p: Project) {
  for (let i = p.levels.length - 1; i >= 0; i--) if (p.levels[i].roofs?.length) return i;
  return p.levels.length - 1;
}

const centroid = (ps: Pt[]) => ({ x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length });

export interface RoofHole { pts: Pt[]; w: number; d: number; area: number; stair: boolean }

/** Huecos de una cubierta, con su tamaño y si caen sobre una escalera del nivel (cubo de escalera). */
export function roofHoles(lv: Level, r: Roof): RoofHole[] {
  const stairs = (lv.stairs ?? []).map((s) => stairGeom(s).outline);
  return (r.holes ?? []).map((h) => {
    const xs = h.map((p) => p.x), ys = h.map((p) => p.y), c = centroid(h);
    return { pts: h, w: Math.max(...xs) - Math.min(...xs), d: Math.max(...ys) - Math.min(...ys), area: polygonArea(h), stair: stairs.some((o) => pointInPolygon(c, o)) };
  });
}

/**
 * Gárgolas de una azotea con pretil: dos en el lado de atrás (y menor), a un cuarto y tres cuartos del largo,
 * como en la vista 3D. Cada una con su punto en el paño interior del pretil.
 */
export function gargoyles(r: Roof): Pt[] {
  const pp = parapet(r);
  if (!pp) return [];
  const [o0, , o2] = pp.outer;
  return [0.25, 0.75].map((k) => ({ x: o0.x + (o2.x - o0.x) * k, y: o0.y + pp.t }));
}

/** Resumen de una azotea para el cuadro de la lámina; cotas en metros sobre el N.P.T. ±0.00. */
export function roofSummary(lv: Level, r: Roof) {
  const g = roofGeom(r), pp = parapet(r), holes = roofHoles(lv, r);
  const [a, , c] = g.outline, w = c.x - a.x, d = c.y - a.y;
  const top = lv.elev + r.base + r.thick;
  const inner = pp ? (w - 2 * pp.t) * (d - 2 * pp.t) : w * d;
  const holeArea = holes.reduce((s, h) => s + h.area, 0);
  return {
    w, d, gross: w * d, net: inner - holeArea, holeArea, holes,
    thick: r.thick, nla: top, parapet: pp, coping: pp ? top + pp.h + 0.05 : null,
    gargoyles: gargoyles(r),
  };
}

/** Datos de una cubierta inclinada; las bajadas pluviales van cerca de cada esquina, en los aleros paralelos a la cumbrera. */
export interface PitchedSummary {
  w: number; d: number; pitch: number; ratio: string; pct: number;
  plan: number; slope: number; eave: number; ridge: number; ridgeLen: number; hipLen: number; gutterLen: number;
  gutters: [Pt, Pt][]; downspouts: Pt[]; dormers: number; finish: string;
}

/**
 * Resumen de una cubierta inclinada para la planta de techos: pendiente (grados, x:12 y %), superficies en planta y
 * real, cotas de alero y cumbrera sobre el N.P.T., largos de cumbrera, limatesas y canalón y las bajadas pluviales.
 */
export function pitchedSummary(lv: Level, r: Roof): PitchedSummary {
  const g = roofGeom(r), [a, , c] = g.outline, w = c.x - a.x, d = c.y - a.y;
  const tan = Math.tan((Math.max(0, Math.min(75, r.pitch)) * Math.PI) / 180), cos = Math.cos(Math.atan(tan));
  const zs = g.faces.flat().map((q) => q.z), zmin = Math.min(...zs);
  const len = ([p, q]: [Pt, Pt]) => Math.hypot(q.x - p.x, q.y - p.y);
  const ridges = g.ridges as [Pt, Pt][];
  // ridges[0] es la cumbrera (si la hay); en la de cuatro aguas siguen las cuatro limatesas
  const ridgeLen = r.kind === "shed" || !ridges.length ? 0 : len(ridges[0]);
  const hipLen = r.kind === "hip" ? ridges.slice(ridgeLen > 1e-6 ? 1 : 0).reduce((s, e) => s + Math.hypot(len(e), (g.top - zmin)), 0) : 0;
  // canalones: los bordes horizontales más bajos de cada faldón que caen sobre el contorno
  const on = (p: Pt) => [Math.abs(p.y - a.y) < 1e-3, Math.abs(p.x - c.x) < 1e-3, Math.abs(p.y - c.y) < 1e-3, Math.abs(p.x - a.x) < 1e-3];
  const gutters: [Pt, Pt][] = [], downspouts: Pt[] = [], alongX = roofAlongX(r), o = r.overhang;
  for (const f of g.faces) f.forEach((p, i) => {
    const q = f[(i + 1) % f.length], A = on(p), B = on(q), side = A.findIndex((v, k) => v && B[k]);
    if (side < 0 || Math.abs(p.z - q.z) > 0.02 || p.z > zmin + 0.02) return;
    gutters.push([{ x: p.x, y: p.y }, { x: q.x, y: q.y }]);
    if ((side % 2 === 0) !== alongX || len([p, q]) < 1) return;
    // como en la vista 3D: a 30 cm de la esquina de la casa, pegada al paño del muro
    const n = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }][side], L = len([p, q]), back = o - 0.11;
    for (const [s, e] of [[p, q], [q, p]]) {
      const t = { x: (e.x - s.x) / L, y: (e.y - s.y) / L }, k = o + 0.3;
      downspouts.push({ x: s.x + t.x * k - n.x * back, y: s.y + t.y * k - n.y * back });
    }
  });
  const plan = w * d;
  return {
    w, d, pitch: r.pitch, ratio: `${(Math.round(tan * 12 * 2) / 2).toString()}:12`, pct: Math.round(tan * 100),
    plan, slope: plan / cos, eave: lv.elev + zmin, ridge: lv.elev + g.top, ridgeLen, hipLen,
    gutterLen: gutters.reduce((s, e) => s + len(e), 0), gutters, downspouts, dormers: (r.dormers ?? []).length,
    finish: roofFinish(r)?.name ?? "",
  };
}

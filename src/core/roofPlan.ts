// Datos de la planta de azotea: nivel que la lleva, superficie, pretil, huecos (cubo de escalera) y desagüe.
import { parapet, pointInPolygon, polygonArea, roofGeom, type Pt } from "./geometry";
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

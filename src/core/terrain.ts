// Terreno con pendiente: un plano inclinado con una plataforma horizontal para la casa, curvas de nivel,
// muros de contención en el borde de la plataforma y volúmenes de corte y relleno.
// La planta tiene el norte arriba (−y); dir es hacia dónde baja el terreno, en grados desde el norte hacia el este.

import type { Pt } from "./geometry";
import type { Project } from "./model";

export interface Terrain {
  /** Pendiente en % (0 = plano) */
  slope: number;
  /** Hacia dónde baja, grados desde el norte en el sentido de las agujas (0 N, 90 E, 180 S, 270 O) */
  dir: number;
  /** Margen de la plataforma alrededor de la casa, en metros */
  pad: number;
  /** Equidistancia de las curvas de nivel, en metros */
  step: number;
}

export const DEFAULT_TERRAIN: Terrain = { slope: 0, dir: 180, pad: 2, step: 0.5 };

export interface Rect { x0: number; y0: number; x1: number; y1: number }

export interface TerrainModel {
  t: Terrain;
  /** Plataforma horizontal de la casa (a la cota del terreno en su centro) */
  pad: Rect;
  /** Cota del terreno natural en un punto, relativa a la plataforma (0 en el centro de la casa) */
  natural(p: Pt): number;
  /** Cota final: 0 dentro de la plataforma, el terreno natural fuera */
  at(p: Pt): number;
}

/** Vector unitario (en planta) hacia el que baja el terreno. */
export function downhill(dir: number): Pt {
  const a = (dir * Math.PI) / 180;
  return { x: Math.sin(a), y: -Math.cos(a) };
}

/** Rectángulo que ocupan los muros, losas y decks de todos los niveles. */
export function footprint(p: Project): Rect | null {
  const pts: Pt[] = [];
  for (const lv of p.levels) {
    for (const w of lv.walls) pts.push({ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 });
    for (const s of lv.slabs) pts.push(...s.pts);
    for (const d of lv.decks ?? []) pts.push({ x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 });
  }
  if (!pts.length) return null;
  return { x0: Math.min(...pts.map((q) => q.x)), y0: Math.min(...pts.map((q) => q.y)), x1: Math.max(...pts.map((q) => q.x)), y1: Math.max(...pts.map((q) => q.y)) };
}

/** Terreno del proyecto, o null si es plano o no hay nada dibujado. */
export function terrainModel(p: Project): TerrainModel | null {
  const t = p.terrain;
  if (!t || !(t.slope > 0)) return null;
  const f = footprint(p);
  if (!f) return null;
  const pad = { x0: f.x0 - t.pad, y0: f.y0 - t.pad, x1: f.x1 + t.pad, y1: f.y1 + t.pad };
  const c = { x: (f.x0 + f.x1) / 2, y: (f.y0 + f.y1) / 2 }, d = downhill(t.dir), k = t.slope / 100;
  const natural = (q: Pt) => -k * ((q.x - c.x) * d.x + (q.y - c.y) * d.y);
  const inPad = (q: Pt) => q.x >= pad.x0 - 1e-9 && q.x <= pad.x1 + 1e-9 && q.y >= pad.y0 - 1e-9 && q.y <= pad.y1 + 1e-9;
  return { t, pad, natural, at: (q) => (inPad(q) ? 0 : natural(q)) };
}

/** Las cuatro orillas de la plataforma, de a a b, con el lado exterior. */
export function padEdges(r: Rect): { a: Pt; b: Pt; name: string }[] {
  return [
    { a: { x: r.x0, y: r.y0 }, b: { x: r.x1, y: r.y0 }, name: "norte" },
    { a: { x: r.x1, y: r.y0 }, b: { x: r.x1, y: r.y1 }, name: "este" },
    { a: { x: r.x1, y: r.y1 }, b: { x: r.x0, y: r.y1 }, name: "sur" },
    { a: { x: r.x0, y: r.y1 }, b: { x: r.x0, y: r.y0 }, name: "oeste" },
  ];
}

export interface RetainingWall { a: Pt; b: Pt; side: string; /** alturas en a y en b: positivas contienen corte (el terreno queda arriba), negativas relleno */ ha: number; hb: number; max: number }

/** Muros de contención en las orillas de la plataforma donde el desnivel pasa de 10 cm. */
export function retainingWalls(tm: TerrainModel): RetainingWall[] {
  return padEdges(tm.pad).map(({ a, b, name }) => {
    const ha = tm.natural(a), hb = tm.natural(b);
    return { a, b, side: name, ha, hb, max: Math.max(Math.abs(ha), Math.abs(hb)) };
  }).filter((w) => w.max > 0.1);
}

/** Volúmenes de corte y relleno para dejar la plataforma horizontal (m³), integrando en una rejilla. */
export function earthwork(tm: TerrainModel): { cut: number; fill: number } {
  const r = tm.pad, n = 60, dx = (r.x1 - r.x0) / n, dy = (r.y1 - r.y0) / n;
  let cut = 0, fill = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const z = tm.natural({ x: r.x0 + (i + 0.5) * dx, y: r.y0 + (j + 0.5) * dy });
    if (z > 0) cut += z * dx * dy; else fill -= z * dx * dy;
  }
  return { cut, fill };
}

/**
 * Curvas de nivel en el rectángulo area, fuera de la plataforma: tramos rectos (el terreno es un plano)
 * con su cota, cada step metros.
 */
export function contours(tm: TerrainModel, area: Rect): { z: number; segs: [Pt, Pt][] }[] {
  const corners = [{ x: area.x0, y: area.y0 }, { x: area.x1, y: area.y0 }, { x: area.x1, y: area.y1 }, { x: area.x0, y: area.y1 }];
  const zs = corners.map(tm.natural), step = Math.max(0.1, tm.t.step);
  const out: { z: number; segs: [Pt, Pt][] }[] = [];
  for (let z = Math.ceil(Math.min(...zs) / step) * step; z <= Math.max(...zs) + 1e-9; z += step) {
    if (Math.abs(z) < 1e-9) continue;
    // corte del plano natural = z con el contorno del área
    const hits: Pt[] = [];
    for (let i = 0; i < 4; i++) {
      const p = corners[i], q = corners[(i + 1) % 4], zp = zs[i], zq = zs[(i + 1) % 4];
      if ((zp - z) * (zq - z) < 0 || (zp === z && zq !== z)) { const u = (z - zp) / (zq - zp); hits.push({ x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u }); }
    }
    if (hits.length < 2) continue;
    out.push({ z: Math.round(z * 1000) / 1000, segs: clipOutside(hits[0], hits[1], tm.pad) });
  }
  return out;
}

/** Partes del segmento a–b fuera del rectángulo r. */
function clipOutside(a: Pt, b: Pt, r: Rect): [Pt, Pt][] {
  // intervalo de t dentro del rectángulo (Liang-Barsky)
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - r.x0], [dx, r.x1 - a.x], [-dy, a.y - r.y0], [dy, r.y1 - a.y]] as const) {
    if (p === 0) { if (q < 0) return [[a, b]]; continue; }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
  }
  if (t0 >= t1) return [[a, b]];
  const P = (t: number): Pt => ({ x: a.x + dx * t, y: a.y + dy * t });
  return [...(t0 > 1e-6 ? [[a, P(t0)] as [Pt, Pt]] : []), ...(t1 < 1 - 1e-6 ? [[P(t1), b] as [Pt, Pt]] : [])];
}

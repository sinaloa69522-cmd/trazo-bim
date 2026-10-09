// Acabados exteriores: revestimientos de fachada (siding) y materiales de cubierta (roofing).
// Cada acabado describe su despiece en metros, que sirve igual para la trama de los alzados,
// la textura del 3D y la muestra de la leyenda.
import { dir, distSeg, type Pt } from "./geometry";
import type { Roof, Wall } from "./model";
import { imperial } from "./units";

/** Cómo se dibuja la pieza en 3D (sombras, relieves, variación de tono). */
export type FinishStyle =
  | "lap" | "dutch" | "shake" | "batten" | "groove" | "stucco" | "brick" | "stone" | "panel"
  | "shingle" | "arch" | "seam" | "corr" | "barrel" | "slate" | "flat" | "membrane" | "green";

export interface Finish {
  id: string;
  name: string;
  en: string;
  /** Color base para el 3D */
  color: string;
  style: FinishStyle;
  /** Alto de hilada (exposición) */
  row?: number;
  /** Largo de pieza; con bond las juntas se desplazan media pieza cada hilada */
  len?: number;
  bond?: boolean;
  /** Piezas de largo irregular (tejuela, pizarra, piedra, teja arquitectónica) */
  random?: boolean;
  /** Líneas verticales continuas (listones, ranuras, juntas alzadas, ondas) */
  col?: number;
  /** Punteado (estuco, cubierta vegetal) */
  dots?: boolean;
  /** Variación de tono entre piezas, 0..1 */
  vary?: number;
}

const IN = 0.0254;

/** Revestimientos de fachada. */
export const SIDINGS: Finish[] = [
  { id: "vinyl-lap", name: "Siding de vinil traslapado", en: "Vinyl lap siding, 4\" exposure", color: "#e9e6dc", style: "lap", row: 4 * IN },
  { id: "vinyl-dutch", name: "Siding de vinil Dutch lap", en: "Vinyl Dutch lap siding", color: "#d6dde0", style: "dutch", row: 4 * IN },
  { id: "fiber-lap", name: "Fibrocemento traslapado (Hardie)", en: "Fiber cement lap siding, 7\" exposure", color: "#7f8d90", style: "lap", row: 7 * IN },
  { id: "smart-lap", name: "Madera de ingeniería traslapada", en: "Engineered wood lap siding (LP SmartSide)", color: "#8d6b50", style: "lap", row: 7 * IN, vary: 0.04 },
  { id: "cedar-bevel", name: "Cedro biselado", en: "Cedar bevel siding", color: "#a8714a", style: "lap", row: 5.5 * IN, vary: 0.1 },
  { id: "board-batten", name: "Tabla y listón (board & batten)", en: "Board & batten siding, 16\" o.c.", color: "#f1efe9", style: "batten", col: 16 * IN },
  { id: "t111", name: "Contrachapado ranurado T1-11", en: "T1-11 grooved plywood siding", color: "#b88b5d", style: "groove", col: 8 * IN, vary: 0.05 },
  { id: "shake-siding", name: "Tejuelas de cedro (shingle siding)", en: "Cedar shingle siding, 7\" exposure", color: "#9b6c49", style: "shake", row: 7 * IN, len: 7 * IN, bond: true, random: true, vary: 0.14 },
  { id: "stucco", name: "Estuco (3 capas)", en: "Portland cement stucco, 3-coat", color: "#e5dac5", style: "stucco", dots: true },
  { id: "brick-veneer", name: "Ladrillo caravista (chapado)", en: "Brick veneer", color: "#a2533e", style: "brick", row: 2.67 * IN, len: 8 * IN, bond: true, vary: 0.1 },
  { id: "stone-veneer", name: "Piedra manufacturada (chapado)", en: "Manufactured stone veneer", color: "#9a9184", style: "stone", row: 6 * IN, len: 14 * IN, bond: true, random: true, vary: 0.18 },
  { id: "metal-panel", name: "Panel metálico vertical", en: "Vertical metal panel siding", color: "#4b5258", style: "panel", col: 12 * IN },
];

/** Materiales de cubierta. */
export const ROOFINGS: Finish[] = [
  { id: "asphalt-3tab", name: "Teja asfáltica 3 tabs", en: "3-tab asphalt shingles", color: "#5e6267", style: "shingle", row: 5 * IN, len: 12 * IN, bond: true, vary: 0.03 },
  { id: "asphalt-arch", name: "Teja asfáltica arquitectónica", en: "Architectural asphalt shingles", color: "#4c4743", style: "arch", row: 5.625 * IN, len: 9 * IN, random: true, vary: 0.16 },
  { id: "cedar-shake", name: "Tejuela de cedro (shake)", en: "Cedar shakes", color: "#8b6547", style: "shake", row: 10 * IN, len: 8 * IN, bond: true, random: true, vary: 0.16 },
  { id: "clay", name: "Teja cerámica", en: "Clay barrel tile", color: "#b4623e", style: "barrel", row: 13 * IN, col: 10 * IN, vary: 0.06 },
  { id: "concrete-tile", name: "Teja de concreto plana", en: "Flat concrete tile", color: "#8e8a84", style: "flat", row: 13 * IN, len: 13 * IN, bond: true, vary: 0.05 },
  { id: "slate", name: "Pizarra natural", en: "Natural slate", color: "#4a5059", style: "slate", row: 7 * IN, len: 12 * IN, bond: true, vary: 0.12 },
  { id: "standing-seam", name: "Lámina metálica de junta alzada", en: "Standing seam metal roof", color: "#3d4b53", style: "seam", col: 18 * IN },
  { id: "corrugated", name: "Lámina corrugada", en: "Corrugated metal roofing", color: "#a9adb0", style: "corr", col: 2.67 * IN },
  { id: "tpo", name: "Membrana TPO (baja pendiente)", en: "TPO single-ply membrane", color: "#eeeeea", style: "membrane", col: 10 * 12 * IN },
  { id: "epdm", name: "Membrana EPDM", en: "EPDM membrane", color: "#303235", style: "membrane", col: 10 * 12 * IN },
  { id: "modbit", name: "Asfalto modificado", en: "Modified bitumen roofing", color: "#5b5a57", style: "membrane", row: 36 * IN },
  { id: "green", name: "Cubierta vegetal", en: "Vegetated (green) roof", color: "#6b8c4a", style: "green", dots: true, vary: 0.2 },
];

const ALL = new Map([...SIDINGS, ...ROOFINGS].map((f) => [f.id, f]));

export function finish(id: string | undefined): Finish | undefined {
  return id ? ALL.get(id) : undefined;
}

/** Nombre del acabado en el idioma de las láminas. */
export const finishName = (f: Finish) => (imperial() ? f.en : f.name);

/** Material de una cubierta: el elegido o, si no hay, teja cerámica en las inclinadas; las planas sin elegir no llevan. */
export function roofFinish(r: Roof): Finish | undefined {
  return finish(r.finish) ?? (r.kind === "flat" ? undefined : ALL.get("clay"));
}

/**
 * Lado exterior del muro: +1 si es el de la normal izquierda (la de loc con n > 0), −1 si es el otro.
 * Se toma el que mira lejos del centro de los muros del nivel.
 */
export function outward(walls: Wall[], w: Wall): 1 | -1 {
  if (!walls.length) return 1;
  let cx = 0, cy = 0;
  for (const x of walls) { cx += (x.x1 + x.x2) / 2; cy += (x.y1 + x.y2) / 2; }
  cx /= walls.length; cy /= walls.length;
  const { ux, uy } = dir(w), mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;
  return (mx - cx) * -uy + (my - cy) * ux >= 0 ? 1 : -1;
}

/** Muro sobre el que se levanta un hastial: el más cercano al centro de su base. */
export function gableWall(walls: Wall[], f: { x: number; y: number; z: number }[]): Wall | undefined {
  const lo = Math.min(...f.map((q) => q.z)), base = f.filter((q) => q.z < lo + 1e-6);
  const c: Pt = { x: base.reduce((t, q) => t + q.x, 0) / base.length, y: base.reduce((t, q) => t + q.y, 0) / base.length };
  return walls.reduce<{ w: Wall; d: number } | null>((m, x) => {
    const d = distSeg(c.x, c.y, x.x1, x.y1, x.x2, x.y2).d;
    return !m || d < m.d ? { w: x, d } : m;
  }, null)?.w;
}

/** Acabados que aparecen en el proyecto, primero los de fachada. */
export function usedFinishes(levels: { walls: Wall[]; roofs: Roof[] }[]): Finish[] {
  const ids = new Set<string>();
  for (const l of levels) for (const w of l.walls) if (w.finish && ALL.has(w.finish)) ids.add(w.finish);
  const roofs = new Set<string>();
  for (const l of levels) for (const r of l.roofs) { const f = roofFinish(r); if (f) roofs.add(f.id); }
  return [...SIDINGS.filter((f) => ids.has(f.id)), ...ROOFINGS.filter((f) => roofs.has(f.id))];
}

/** Pseudoaleatorio estable (para que la textura y el despiece no cambien de un dibujo a otro). */
export function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
}

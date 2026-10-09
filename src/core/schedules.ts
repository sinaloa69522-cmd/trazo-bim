import { imperial } from "./units";
import { furnitureDef } from "./furniture";
import { dir } from "./geometry";
import { CIRCUITS, MEP, runLength, SYSTEMS, type Discipline } from "./mep";
import type { OpeningKind, Project } from "./model";
import { computeRooms } from "./rooms";
import { wallType, wallTypeLabel } from "./wallTypes";

/** Un tipo de puerta o ventana: huecos con las mismas medidas comparten marca. */
export interface OpeningType {
  mark: string;
  kind: OpeningKind;
  width: number;
  height: number;
  sill: number;
  count: number;
  /** Unidades por nivel, en el orden de los niveles */
  perLevel: { level: string; count: number }[];
}

const cm = (v: number) => Math.round(v * 100);

/**
 * Tabla de planificación de puertas o ventanas de todo el proyecto, como en Revit:
 * agrupa por medidas y numera los tipos (P1, P2… o V1, V2…) de menor a mayor.
 * marks lleva la marca de cada hueco, por id, para cada nivel.
 */
export function openingSchedule(p: Project, kind: OpeningKind) {
  const types = new Map<string, OpeningType>();
  const key = (o: { width: number; height: number; sill: number }) => `${cm(o.width)}x${cm(o.height)}x${cm(o.sill)}`;
  for (const lv of p.levels) for (const o of lv.openings) {
    if (o.kind !== kind || !lv.walls.some((w) => w.id === o.wallId)) continue;
    const k = key(o);
    let t = types.get(k);
    if (!t) { t = { mark: "", kind, width: o.width, height: o.height, sill: o.sill, count: 0, perLevel: [] }; types.set(k, t); }
    t.count++;
    const pl = t.perLevel.find((x) => x.level === lv.name);
    if (pl) pl.count++; else t.perLevel.push({ level: lv.name, count: 1 });
  }
  const rows = [...types.entries()].sort(([, a], [, b]) => a.width - b.width || a.height - b.height || a.sill - b.sill);
  // en EE.UU. D1, W1…
  rows.forEach(([, t], i) => { t.mark = `${kind === "door" ? (imperial() ? "D" : "P") : imperial() ? "W" : "V"}${i + 1}`; });
  const byKey = new Map(rows);
  const marks = p.levels.map((lv) => new Map(lv.openings.filter((o) => o.kind === kind && byKey.has(key(o))).map((o) => [o.id, byKey.get(key(o))!.mark])));
  return { types: rows.map(([, t]) => t), marks };
}

/** Marcas de puertas y ventanas juntas para el nivel indicado. */
export function levelMarks(p: Project, level: number) {
  const d = openingSchedule(p, "door").marks[level], w = openingSchedule(p, "window").marks[level];
  return new Map([...d, ...w]);
}

export interface RoomRow { level: string; name: string; area: number }

/** Cuadro de superficies útiles por nivel (solo espacios cerrados). */
export function roomSchedule(p: Project): RoomRow[] {
  const out: RoomRow[] = [];
  for (const lv of p.levels) {
    const g = computeRooms(lv);
    for (const r of lv.rooms) {
      const c = g?.rooms.get(r.id);
      if (c?.ok) out.push({ level: lv.name, name: r.name, area: c.area });
    }
  }
  return out;
}

export interface WallRow { type: string; material: string; count: number; length: number; area: number }

/** Medición de muros por tipo en todo el proyecto: longitud por el eje y superficie descontando huecos. */
export function wallSchedule(p: Project): WallRow[] {
  const rows = new Map<string, WallRow>();
  for (const lv of p.levels) for (const w of lv.walls) {
    const name = wallTypeLabel(w), L = dir(w).L;
    const holes = lv.openings.filter((o) => o.wallId === w.id).reduce((s, o) => s + o.width * Math.max(0, Math.min(o.height, w.height - o.sill)), 0);
    let r = rows.get(name);
    if (!r) { r = { type: name, material: wallType(w.type).material, count: 0, length: 0, area: 0 }; rows.set(name, r); }
    r.count++; r.length += L; r.area += Math.max(0, L * w.height - holes);
  }
  return [...rows.values()].sort((a, b) => a.type.localeCompare(b.type, "es"));
}

export interface MepRow { kind: string; label: string; count: number }

/** Recuento de mecanismos o puntos por tipo, en un nivel o en todo el proyecto, en el orden de la biblioteca. */
export function mepSchedule(p: Project, disc: Discipline, level?: number): MepRow[] {
  const lvs = level === undefined ? p.levels : [p.levels[level]];
  // en electricidad también cuentan los aparatos de fontanería conectados a un circuito (el termo)
  const shown = (f: { kind: string; circuit: string }, own: boolean) => own || (disc === "elec" && !!f.circuit);
  return MEP.map((d) => ({ kind: d.kind, label: d.label, count: lvs.reduce((s, l) => s + l.fixtures.filter((f) => f.kind === d.kind && shown(f, d.disc === disc)).length, 0) }))
    .filter((r) => r.count > 0);
}

export interface CircuitRow { circuit: string; name: string; points: number; length: number }

/** Cuadro de circuitos de un nivel: puntos conectados y metros de canalización que salen del cuadro. */
export function circuitSchedule(p: Project, level: number): CircuitRow[] {
  const lv = p.levels[level], rows = new Map<string, CircuitRow>();
  for (const f of lv.fixtures) {
    if (!f.circuit) continue;
    let r = rows.get(f.circuit);
    if (!r) { r = { circuit: f.circuit, name: CIRCUITS[f.circuit] ?? "Circuito", points: 0, length: 0 }; rows.set(f.circuit, r); }
    r.points++;
  }
  // cada recorrido se asigna al circuito del punto en el que termina
  for (const run of lv.runs) {
    if (run.system !== "elec") continue;
    const end = run.pts[run.pts.length - 1];
    const f = lv.fixtures.find((x) => x.circuit && Math.hypot(x.x - end.x, x.y - end.y) < 0.05);
    if (f) rows.get(f.circuit)!.length += runLength(run);
  }
  return [...rows.values()].sort((a, b) => a.circuit.localeCompare(b.circuit, "es", { numeric: true }));
}

/** Metros de tubería o canalización por red en un nivel. */
export function runSchedule(p: Project, disc: Discipline, level: number) {
  const lv = p.levels[level];
  return SYSTEMS.filter((s) => (disc === "elec") === (s.id === "elec"))
    .map((s) => ({ system: s.id, label: s.label, length: lv.runs.filter((r) => r.system === s.id).reduce((t, r) => t + runLength(r), 0) }))
    .filter((r) => r.length > 0);
}

/** Aparatos sanitarios de un nivel por tipo. */
export function sanitarySchedule(p: Project, level: number) {
  const rows = new Map<string, number>();
  for (const f of p.levels[level].furniture) {
    const d = furnitureDef(f.kind);
    if (d.ifc.cls === "IFCSANITARYTERMINAL" || f.kind === "kitchen") rows.set(d.label, (rows.get(d.label) ?? 0) + 1);
  }
  return [...rows.entries()].map(([label, count]) => ({ label, count }));
}

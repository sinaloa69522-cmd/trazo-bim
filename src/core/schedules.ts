import type { OpeningKind, Project } from "./model";
import { computeRooms } from "./rooms";

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
  rows.forEach(([, t], i) => { t.mark = `${kind === "door" ? "P" : "V"}${i + 1}`; });
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

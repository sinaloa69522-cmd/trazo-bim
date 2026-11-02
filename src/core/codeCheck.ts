// Revisión de reglamento para vivienda: dimensiones mínimas de cada espacio, iluminación y ventilación
// naturales, altura libre, ancho de puertas y escaleras. Los valores siguen las Normas Técnicas
// Complementarias para el Proyecto Arquitectónico (CDMX), que la mayoría de los reglamentos municipales
// de México toman como referencia. Es una ayuda: el reglamento del municipio manda.

import type { Pt } from "./geometry";
import type { Level, Project } from "./model";
import { stairSteps } from "./stairs";
import { computeRooms, inRoom, isOutside, minSide, openingSides, outsideGrid } from "./rooms";

export type RoomUse = "recamara-principal" | "recamara" | "estancia" | "comedor" | "estancia-comedor" | "cocina" | "bano" | "lavado" | "estudio" | "circulacion" | "cochera" | "otro";

export interface RoomRule {
  label: string;
  /** Área mínima en m² y lado libre mínimo en m (0 = sin mínimo) */
  area: number;
  side: number;
  /** Local habitable: pide iluminación y ventilación naturales */
  habitable: boolean;
  /** Ancho mínimo de su puerta */
  door: number;
}

export const RULES: Record<RoomUse, RoomRule> = {
  "recamara-principal": { label: "Recámara principal", area: 7.0, side: 2.4, habitable: true, door: 0.75 },
  recamara: { label: "Recámara", area: 6.0, side: 2.2, habitable: true, door: 0.75 },
  estancia: { label: "Estancia", area: 7.3, side: 2.6, habitable: true, door: 0.75 },
  comedor: { label: "Comedor", area: 6.3, side: 2.4, habitable: true, door: 0.75 },
  "estancia-comedor": { label: "Estancia-comedor", area: 13.6, side: 2.6, habitable: true, door: 0.75 },
  cocina: { label: "Cocina", area: 3.0, side: 1.5, habitable: false, door: 0.6 },
  bano: { label: "Baño", area: 0, side: 0, habitable: false, door: 0.6 },
  lavado: { label: "Cuarto de lavado", area: 1.68, side: 1.4, habitable: false, door: 0.6 },
  estudio: { label: "Estudio", area: 6.0, side: 2.2, habitable: true, door: 0.75 },
  circulacion: { label: "Circulación", area: 0, side: 0.75, habitable: false, door: 0.6 },
  cochera: { label: "Cochera", area: 0, side: 2.5, habitable: false, door: 0 },
  otro: { label: "Otro", area: 0, side: 0, habitable: false, door: 0 },
};

/** Valores generales */
export const LIMITS = {
  /** Altura libre mínima de locales habitables */
  height: 2.3,
  /** Ventanas: área de vidrio ≥ 17.5 % del piso; ventilación (parte que abre) ≥ 5 % */
  light: 0.175,
  vent: 0.05,
  /** Parte de la ventana que se supone abre (corrediza) */
  openable: 0.5,
  /** Puerta de acceso a la vivienda */
  entry: 0.9,
  /** Escaleras dentro de la vivienda */
  stairWidth: 0.75,
  stairWidthRec: 0.9,
  tread: 0.25,
  riser: 0.18,
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Uso del espacio según su nombre. */
export function roomUse(name: string): RoomUse {
  const n = norm(name);
  if (/bano|wc|sanitario|toilet|aseo|medio bano/.test(n)) return "bano";
  if (/lavado|lavanderia|servicio/.test(n)) return "lavado";
  if (/cochera|garage|garaje|estacionamiento/.test(n)) return "cochera";
  if (/pasillo|circulacion|vestibulo|recibidor|hall|distribuidor/.test(n)) return "circulacion";
  if (/recamara|dormitorio|habitacion|cuarto/.test(n)) return /principal|master|ppal/.test(n) ? "recamara-principal" : "recamara";
  const sala = /sala|estancia|estar/.test(n), com = /comedor/.test(n), coc = /cocina/.test(n);
  if (sala && com) return "estancia-comedor";
  if (sala) return "estancia";
  if (com) return coc ? "estancia-comedor" : "comedor";
  if (coc) return "cocina";
  if (/estudio|oficina|biblioteca/.test(n)) return "estudio";
  return "otro";
}

export type Severity = "error" | "warn";

export interface Finding {
  level: number;
  sev: Severity;
  /** Qué se revisó: Área, Lado, Iluminación, Ventilación, Altura, Puerta, Escalera */
  topic: string;
  /** Espacio o elemento */
  where: string;
  msg: string;
  at: Pt;
}

export interface RoomCheck {
  level: number;
  name: string;
  use: RoomUse;
  area: number;
  side: number;
  /** Vidrio y parte que abre, m² */
  glass: number;
  vent: number;
  height: number;
  ok: boolean;
}

export interface CheckResult {
  findings: Finding[];
  rooms: RoomCheck[];
  /** Cuántas revisiones se hicieron (para el resumen "n de m cumplen") */
  checks: number;
}

const m2 = (v: number) => `${v.toFixed(2)} m²`, m = (v: number) => `${v.toFixed(2)} m`;

/** Revisa un nivel. */
export function checkLevel(lv: Level, li: number): CheckResult {
  const out: CheckResult = { findings: [], rooms: [], checks: 0 };
  const add = (sev: Severity, topic: string, where: string, msg: string, at: Pt) => out.findings.push({ level: li, sev, topic, where, msg, at });
  const H = lv.walls.length ? Math.max(...lv.walls.map((w) => w.height)) : 0;
  const g = computeRooms(lv), og = outsideGrid(lv);
  const roomDoor = new Map<number, number>();
  if (g) for (const r of lv.rooms) {
    const c = g.rooms.get(r.id);
    if (!c?.ok) continue;
    const use = roomUse(r.name), rule = RULES[use], at = { x: c.cx, y: c.cy };
    const side = minSide(g, c);
    let glass = 0, maxDoor = 0;
    for (const o of lv.openings) {
      const sides = openingSides(lv, o);
      if (!sides || !sides.some((p) => inRoom(g, c, p.x, p.y))) continue;
      if (o.kind === "window") glass += o.width * o.height;
      else maxDoor = Math.max(maxDoor, o.width);
    }
    roomDoor.set(r.id, maxDoor);
    const vent = glass * LIMITS.openable;
    let ok = true;
    if (rule.area) { out.checks++; if (c.area < rule.area - 0.005) { ok = false; add("error", "Área", r.name, `${m2(c.area)}; mínimo para ${rule.label.toLowerCase()} ${m2(rule.area)}`, at); } }
    if (rule.side) { out.checks++; if (side < rule.side - 0.03) { ok = false; add("error", "Lado libre", r.name, `${m(side)}; mínimo ${m(rule.side)}`, at); } }
    if (rule.habitable) {
      out.checks += 3;
      if (glass < c.area * LIMITS.light - 0.005) { ok = false; add("error", "Iluminación", r.name, `ventanas ${m2(glass)}; se piden ${m2(c.area * LIMITS.light)} (17.5 % del piso)`, at); }
      if (vent < c.area * LIMITS.vent - 0.005) { ok = false; add("error", "Ventilación", r.name, `parte que abre ${m2(vent)}; se piden ${m2(c.area * LIMITS.vent)} (5 % del piso)`, at); }
      if (H && H < LIMITS.height - 0.005) { ok = false; add("error", "Altura", r.name, `altura libre ${m(H)}; mínimo ${m(LIMITS.height)}`, at); }
    } else if ((use === "bano" || use === "cocina") && glass === 0) {
      out.checks++;
      add("warn", "Ventilación", r.name, "sin ventana: lleva extractor con ducto al exterior", at);
    }
    if (rule.door) {
      out.checks++;
      if (!maxDoor) { ok = false; add("warn", "Puerta", r.name, "no tiene puerta dibujada", at); }
      else if (maxDoor < rule.door - 0.005) { ok = false; add("error", "Puerta", r.name, `puerta de ${m(maxDoor)}; mínimo ${m(rule.door)}`, at); }
    }
    out.rooms.push({ level: li, name: r.name, use, area: c.area, side, glass, vent, height: H, ok });
  }
  // puertas al exterior: la más ancha de cada nivel con acceso es la de entrada
  if (og) {
    const ext = lv.openings.filter((o) => o.kind === "door").map((o) => ({ o, s: openingSides(lv, o, 0.12) })).filter((x) => x.s && x.s.some((p) => isOutside(og, p.x, p.y)) && x.s.some((p) => !isOutside(og, p.x, p.y)));
    if (ext.length && li === 0) {
      out.checks++;
      const best = ext.reduce((a, b) => (b.o.width > a.o.width ? b : a));
      if (best.o.width < LIMITS.entry - 0.005) {
        const [a, b] = best.s!;
        add("error", "Puerta", "Acceso", `la puerta de entrada mide ${m(best.o.width)}; mínimo ${m(LIMITS.entry)}`, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      }
    }
  }
  for (const s of lv.stairs) {
    const st = stairSteps(s), at = { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
    out.checks += 3;
    if (s.width < LIMITS.stairWidth - 0.005) add("error", "Escalera", "Escalera", `ancho ${m(s.width)}; mínimo ${m(LIMITS.stairWidth)}`, at);
    else if (s.width < LIMITS.stairWidthRec - 0.005) add("warn", "Escalera", "Escalera", `ancho ${m(s.width)}; se recomienda ${m(LIMITS.stairWidthRec)}`, at);
    if (s.kind !== "caracol") {
      if (st.tread < LIMITS.tread - 0.005) add("error", "Escalera", "Escalera", `huella de ${(st.tread * 100).toFixed(1)} cm; mínimo ${LIMITS.tread * 100} cm`, at);
      if (st.riser > LIMITS.riser + 0.005) add("error", "Escalera", "Escalera", `peralte de ${(st.riser * 100).toFixed(1)} cm; máximo ${LIMITS.riser * 100} cm`, at);
    }
  }
  return out;
}

/** Revisa todo el proyecto. */
export function checkProject(p: Project): CheckResult {
  const all: CheckResult = { findings: [], rooms: [], checks: 0 };
  p.levels.forEach((lv, i) => {
    const r = checkLevel(lv, i);
    all.findings.push(...r.findings); all.rooms.push(...r.rooms); all.checks += r.checks;
  });
  return all;
}

// Revisión de reglamento para vivienda: dimensiones mínimas de cada espacio, iluminación y ventilación
// naturales, altura libre, ancho de puertas y escaleras. Los valores siguen las Normas Técnicas
// Complementarias para el Proyecto Arquitectónico (CDMX), que la mayoría de los reglamentos municipales
// de México toman como referencia. En pies y pulgadas se revisa con el International Residential Code
// (IRC 2021), que adoptan casi todos los estados de EE.UU. Es una ayuda: el reglamento local manda.

import type { Pt } from "./geometry";
import { FT, IN, fmtArea, fmtLen } from "./units";
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

/** Código con que se revisa: NTC de la CDMX (métrico) o IRC 2021 (pies y pulgadas). */
export type Code = "mx" | "us";
export const codeOf = (p: Project): Code => (p.units === "imperial" ? "us" : "mx");

const SQFT = FT * FT;
/**
 * IRC 2021: R304 locales habitables de 70 sq ft y 7' por lado (cocinas no), R305 altura de 7',
 * R303 vidrio del 8 % y ventilación del 4 % del piso, R310 ventana de escape en cada recámara
 * (5.7 sq ft libres, 24" de alto, 20" de ancho, antepecho ≤ 44"), R311.2 puerta de salida de 32" libres
 * (hoja de 36"), R311.6 pasillos de 3', R311.7 escaleras de 36", peralte ≤ 7¾" y huella ≥ 10".
 */
export const RULES_US: Record<RoomUse, RoomRule> = {
  "recamara-principal": { label: "Primary bedroom", area: 70 * SQFT, side: 7 * FT, habitable: true, door: 0 },
  recamara: { label: "Bedroom", area: 70 * SQFT, side: 7 * FT, habitable: true, door: 0 },
  estancia: { label: "Living room", area: 70 * SQFT, side: 7 * FT, habitable: true, door: 0 },
  comedor: { label: "Dining room", area: 70 * SQFT, side: 7 * FT, habitable: true, door: 0 },
  "estancia-comedor": { label: "Living-dining", area: 70 * SQFT, side: 7 * FT, habitable: true, door: 0 },
  cocina: { label: "Kitchen", area: 0, side: 0, habitable: false, door: 0 },
  bano: { label: "Bathroom", area: 0, side: 0, habitable: false, door: 0 },
  lavado: { label: "Laundry", area: 0, side: 0, habitable: false, door: 0 },
  estudio: { label: "Office / den", area: 70 * SQFT, side: 7 * FT, habitable: true, door: 0 },
  circulacion: { label: "Hallway", area: 0, side: 3 * FT, habitable: false, door: 0 },
  cochera: { label: "Garage", area: 0, side: 0, habitable: false, door: 0 },
  otro: { label: "Other", area: 0, side: 0, habitable: false, door: 0 },
};

export const LIMITS_US = {
  height: 7 * FT, light: 0.08, vent: 0.04, openable: 0.5,
  /** Hoja de 36" para dar 32" libres */
  entry: 36 * IN,
  stairWidth: 36 * IN, stairWidthRec: 36 * IN, tread: 10 * IN, riser: 7.75 * IN,
  /** R310: abertura libre de escape */
  egressArea: 5.7 * SQFT, egressH: 24 * IN, egressW: 20 * IN, egressSill: 44 * IN,
  /** R303.3: baño con 3 sq ft de vidrio, la mitad practicable, o extractor */
  bathGlass: 3 * SQFT,
};

/** Reglas y límites del código. */
export const codeRules = (c: Code) => (c === "us" ? { rules: RULES_US, limits: LIMITS_US } : { rules: RULES, limits: LIMITS });

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Uso del espacio según su nombre. */
export function roomUse(name: string): RoomUse {
  const n = norm(name);
  if (/bano|wc|sanitario|toilet|aseo|medio bano|bath|powder/.test(n)) return "bano";
  if (/lavado|lavanderia|servicio|laundry|utility|mud ?room/.test(n)) return "lavado";
  if (/cochera|garage|garaje|estacionamiento/.test(n)) return "cochera";
  if (/pasillo|circulacion|vestibulo|recibidor|hall|distribuidor|foyer|entry|corridor/.test(n)) return "circulacion";
  if (/closet|walk-?in|pantry|storage|despensa|bodega/.test(n)) return "otro";
  if (/recamara|dormitorio|habitacion|cuarto|bedroom|\bbed\b|\bbr\b|suite/.test(n)) return /principal|master|ppal|primary|owner/.test(n) ? "recamara-principal" : "recamara";
  const sala = /sala|estancia|estar|living|family|great room/.test(n), com = /comedor|dining/.test(n), coc = /cocina|kitchen/.test(n);
  if (sala && com) return "estancia-comedor";
  if (sala) return "estancia";
  if (com) return coc ? "estancia-comedor" : "comedor";
  if (coc) return "cocina";
  if (/estudio|oficina|biblioteca|office|study|den\b|library/.test(n)) return "estudio";
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


/** Revisa un nivel. */
export function checkLevel(lv: Level, li: number, code: Code = "mx"): CheckResult {
  const US = code === "us", { rules: RS, limits: LM } = codeRules(code), u = US ? "imperial" as const : "metric" as const;
  const sf = (v: number) => `${(v / SQFT).toFixed(1)} sq ft`;
  const A = (v: number) => fmtArea(v, u), Lm = (v: number) => fmtLen(v, u), pc = (v: number) => `${+(v * 100).toFixed(1)} %`;
  const out: CheckResult = { findings: [], rooms: [], checks: 0 };
  const add = (sev: Severity, topic: string, where: string, msg: string, at: Pt) => out.findings.push({ level: li, sev, topic, where, msg, at });
  const H = lv.walls.length ? Math.max(...lv.walls.map((w) => w.height)) : 0;
  const g = computeRooms(lv), og = outsideGrid(lv);
  const roomDoor = new Map<number, number>();
  if (g) for (const r of lv.rooms) {
    const c = g.rooms.get(r.id);
    if (!c?.ok) continue;
    const use = roomUse(r.name), rule = RS[use], at = { x: c.cx, y: c.cy };
    const side = minSide(g, c);
    let glass = 0, maxDoor = 0;
    const wins: typeof lv.openings = [];
    for (const o of lv.openings) {
      const sides = openingSides(lv, o);
      if (!sides || !sides.some((p) => inRoom(g, c, p.x, p.y))) continue;
      if (o.kind === "window") { glass += o.width * o.height; wins.push(o); }
      else maxDoor = Math.max(maxDoor, o.width);
    }
    roomDoor.set(r.id, maxDoor);
    const vent = glass * LM.openable;
    let ok = true;
    const ref = (mx: string, us: string) => (US ? us : mx);
    if (rule.area) { out.checks++; if (c.area < rule.area - 0.005) { ok = false; add("error", "Área", r.name, `${A(c.area)}; mínimo para ${rule.label.toLowerCase()} ${A(rule.area)}${ref("", " (IRC R304.1)")}`, at); } }
    if (rule.side) { out.checks++; if (side < rule.side - 0.03) { ok = false; add("error", "Lado libre", r.name, `${Lm(side)}; mínimo ${Lm(rule.side)}${ref("", use === "circulacion" ? " (IRC R311.6)" : " (IRC R304.2)")}`, at); } }
    if (rule.habitable) {
      out.checks += 3;
      if (glass < c.area * LM.light - 0.005) { ok = false; add("error", "Iluminación", r.name, `ventanas ${A(glass)}; se piden ${A(c.area * LM.light)} (${pc(LM.light)} del piso${ref("", ", IRC R303.1")})`, at); }
      if (vent < c.area * LM.vent - 0.005) { ok = false; add("error", "Ventilación", r.name, `parte que abre ${A(vent)}; se piden ${A(c.area * LM.vent)} (${pc(LM.vent)} del piso${ref("", ", IRC R303.1")})`, at); }
      if (H && H < LM.height - 0.005) { ok = false; add("error", "Altura", r.name, `altura libre ${Lm(H)}; mínimo ${Lm(LM.height)}${ref("", " (IRC R305.1)")}`, at); }
    } else if (US && use === "bano") {
      out.checks++;
      if (glass < LIMITS_US.bathGlass - 0.005) add("warn", "Ventilación", r.name, `vidrio ${sf(glass)}, menos de 3 sq ft: lleva extractor de 50 cfm con salida al exterior (IRC R303.3)`, at);
    } else if ((use === "bano" || use === "cocina") && glass === 0) {
      out.checks++;
      add("warn", "Ventilación", r.name, "sin ventana: lleva extractor con ducto al exterior", at);
    }
    // R310: cada recámara necesita una ventana de escape (de guillotina se abre la mitad de alto)
    if (US && (use === "recamara" || use === "recamara-principal")) {
      out.checks++;
      const clear = (o: (typeof wins)[number]) => ({ w: o.width - 2 * IN, h: o.height / 2 - 2 * IN, sill: o.sill + o.height / 2 });
      const okWin = wins.find((o) => { const q = clear(o); return q.w >= LIMITS_US.egressW - 1e-3 && q.h >= LIMITS_US.egressH - 1e-3 && q.w * q.h >= LIMITS_US.egressArea - 1e-3 && o.sill <= LIMITS_US.egressSill + 1e-3; });
      if (!okWin) {
        ok = false;
        const best = wins.reduce<(typeof wins)[number] | null>((a, b) => (!a || b.width * b.height > a.width * a.height ? b : a), null);
        add("error", "Escape", r.name, best
          ? `ninguna ventana sirve de escape: la mayor (${Lm(best.width)} × ${Lm(best.height)}, antepecho ${Lm(best.sill)}) deja ${sf(Math.max(0, clear(best).w * clear(best).h))} libres; se piden 5.7 sq ft, 24" de alto, 20" de ancho y antepecho ≤ 44" (IRC R310.2)`
          : `sin ventana de escape; se pide una de 5.7 sq ft libres con antepecho ≤ 44" (IRC R310)`, at);
      }
    }
    if (rule.door) {
      out.checks++;
      if (!maxDoor) { ok = false; add("warn", "Puerta", r.name, "no tiene puerta dibujada", at); }
      else if (maxDoor < rule.door - 0.005) { ok = false; add("error", "Puerta", r.name, `puerta de ${Lm(maxDoor)}; mínimo ${Lm(rule.door)}`, at); }
    }
    out.rooms.push({ level: li, name: r.name, use, area: c.area, side, glass, vent, height: H, ok });
  }
  // puertas al exterior: la más ancha de cada nivel con acceso es la de entrada
  if (og) {
    const ext = lv.openings.filter((o) => o.kind === "door").map((o) => ({ o, s: openingSides(lv, o, 0.12) })).filter((x) => x.s && x.s.some((p) => isOutside(og, p.x, p.y)) && x.s.some((p) => !isOutside(og, p.x, p.y)));
    if (ext.length && li === 0) {
      out.checks++;
      const best = ext.reduce((a, b) => (b.o.width > a.o.width ? b : a));
      if (best.o.width < LM.entry - 0.005) {
        const [a, b] = best.s!;
        add("error", "Puerta", "Acceso", `la puerta de entrada mide ${Lm(best.o.width)}; mínimo ${Lm(LM.entry)}${US ? " para dar 32\" libres (IRC R311.2)" : ""}`, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      }
    }
  }
  for (const s of lv.stairs) {
    const st = stairSteps(s), at = { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
    out.checks += 3;
    const minW = US && s.kind === "caracol" ? 26 * IN : LM.stairWidth;
    if (s.width < minW - 0.005) add("error", "Escalera", "Escalera", `ancho ${Lm(s.width)}; mínimo ${Lm(minW)}${US ? " (IRC R311.7.1)" : ""}`, at);
    else if (s.width < LM.stairWidthRec - 0.005) add("warn", "Escalera", "Escalera", `ancho ${Lm(s.width)}; se recomienda ${Lm(LM.stairWidthRec)}`, at);
    if (s.kind !== "caracol") {
      const len = (v: number) => (US ? `${+(v / IN).toFixed(2)}"` : `${(v * 100).toFixed(1)} cm`);
      if (st.tread < LM.tread - 0.001) add("error", "Escalera", "Escalera", `huella de ${len(st.tread)}; mínimo ${len(LM.tread)}${US ? " (IRC R311.7.5.2)" : ""}`, at);
      if (st.riser > LM.riser + 0.001) add("error", "Escalera", "Escalera", `peralte de ${len(st.riser)}; máximo ${len(LM.riser)}${US ? " (IRC R311.7.5.1)" : ""}`, at);
    }
  }
  return out;
}

/** Revisa todo el proyecto. */
export function checkProject(p: Project): CheckResult {
  const all: CheckResult = { findings: [], rooms: [], checks: 0 };
  p.levels.forEach((lv, i) => {
    const r = checkLevel(lv, i, codeOf(p));
    all.findings.push(...r.findings); all.rooms.push(...r.rooms); all.checks += r.checks;
  });
  return all;
}

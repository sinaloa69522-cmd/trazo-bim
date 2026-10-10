import { furnitureDef, furnitureToPlan } from "./furniture";
import type { Pt } from "./geometry";
import type { Fixture, Furniture, Run, RunSystem } from "./model";

/** Disciplina de instalaciones: electricidad o plomería (fontanería y saneamiento). */
export type Discipline = "elec" | "plum";

/** Trazo de un símbolo en coordenadas locales (metros, origen en el punto; el lado -y va contra el muro). */
export interface SymStroke { pts: Pt[]; closed?: boolean; fill?: boolean }

export interface MepDef {
  kind: string;
  label: string;
  disc: Discipline;
  /** Red a la que pertenece: da el color del símbolo */
  sys: RunSystem;
  /** Altura de montaje sobre el suelo */
  h: number;
  /** Se coloca contra el muro más cercano, mirando a la habitación */
  wall: boolean;
  /** Circuito por defecto (solo electricidad) */
  circuit: string;
  /** Rótulo dentro del símbolo */
  text?: string;
  /** Clase y tipo predefinido en IFC4 */
  ifc: { cls: string; type: string };
  draw: () => SymStroke[];
}

const circle = (cx: number, cy: number, r: number, fill = false, n = 18): SymStroke =>
  ({ pts: Array.from({ length: n }, (_, i) => ({ x: cx + r * Math.cos((i / n) * Math.PI * 2), y: cy + r * Math.sin((i / n) * Math.PI * 2) })), closed: true, fill });
/** Semicírculo del lado +y con el diámetro sobre y = cy. */
const half = (cy: number, r: number, fill = false, n = 12): SymStroke =>
  ({ pts: Array.from({ length: n + 1 }, (_, i) => ({ x: r * Math.cos((i / n) * Math.PI), y: cy + r * Math.sin((i / n) * Math.PI) })), closed: true, fill });
const ln = (x0: number, y0: number, x1: number, y1: number): SymStroke => ({ pts: [{ x: x0, y: y0 }, { x: x1, y: y1 }] });
const rect = (x0: number, y0: number, x1: number, y1: number, fill = false): SymStroke =>
  ({ pts: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], closed: true, fill });

/** Símbolos habituales en los planos de instalaciones españoles y latinoamericanos. */
export const MEP: MepDef[] = [
  {
    kind: "luz", label: "Punto de luz", disc: "elec", sys: "elec", h: 2.5, wall: false, circuit: "C1",
    ifc: { cls: "IFCLIGHTFIXTURE", type: "POINTSOURCE" },
    draw: () => [circle(0, 0, 0.15), ln(-0.106, -0.106, 0.106, 0.106), ln(-0.106, 0.106, 0.106, -0.106)],
  },
  {
    kind: "aplique", label: "Aplique de pared", disc: "elec", sys: "elec", h: 2.0, wall: true, circuit: "C1",
    ifc: { cls: "IFCLIGHTFIXTURE", type: "POINTSOURCE" },
    draw: () => [ln(-0.16, -0.06, 0.16, -0.06), half(-0.06, 0.13), ln(-0.07, -0.01, 0.07, 0.13), ln(0.07, -0.01, -0.07, 0.13)],
  },
  {
    kind: "interruptor", label: "Interruptor", disc: "elec", sys: "elec", h: 1.1, wall: true, circuit: "C1",
    ifc: { cls: "IFCSWITCHINGDEVICE", type: "TOGGLESWITCH" },
    draw: () => [circle(0, 0, 0.05, true, 12), ln(0.035, 0.035, 0.2, 0.2), ln(0.2, 0.2, 0.25, 0.15)],
  },
  {
    kind: "conmutador", label: "Conmutador", disc: "elec", sys: "elec", h: 1.1, wall: true, circuit: "C1",
    ifc: { cls: "IFCSWITCHINGDEVICE", type: "TOGGLESWITCH" },
    draw: () => [circle(0, 0, 0.05, true, 12), ln(-0.2, -0.2, 0.2, 0.2), ln(0.2, 0.2, 0.25, 0.15), ln(-0.2, -0.2, -0.25, -0.15)],
  },
  {
    kind: "enchufe", label: "Base de enchufe 16 A", disc: "elec", sys: "elec", h: 0.3, wall: true, circuit: "C2",
    ifc: { cls: "IFCOUTLET", type: "POWEROUTLET" },
    draw: () => [half(-0.06, 0.13), ln(-0.13, -0.06, 0.13, -0.06), ln(0, 0.07, 0, 0.17)],
  },
  {
    kind: "enchufe-fuerza", label: "Base de enchufe 25 A", disc: "elec", sys: "elec", h: 0.9, wall: true, circuit: "C3",
    ifc: { cls: "IFCOUTLET", type: "POWEROUTLET" },
    draw: () => [half(-0.06, 0.13, true), ln(-0.13, -0.06, 0.13, -0.06), ln(0, 0.07, 0, 0.19), ln(-0.06, 0.19, 0.06, 0.19)],
  },
  {
    kind: "cuadro", label: "Cuadro general", disc: "elec", sys: "elec", h: 1.6, wall: true, circuit: "", text: "CGMP",
    ifc: { cls: "IFCELECTRICDISTRIBUTIONBOARD", type: "DISTRIBUTIONBOARD" },
    draw: () => [rect(-0.25, -0.06, 0.25, 0.1), { pts: [{ x: -0.25, y: -0.06 }, { x: 0.25, y: -0.06 }, { x: -0.25, y: 0.1 }], closed: true, fill: true }],
  },
  {
    kind: "acometida", label: "Acometida y medidor", disc: "elec", sys: "elec", h: 1.6, wall: true, circuit: "", text: "M",
    ifc: { cls: "IFCFLOWMETER", type: "ENERGYMETER" },
    draw: () => [rect(-0.2, -0.06, 0.2, 0.2), circle(0, 0.07, 0.09, false, 14)],
  },
  {
    kind: "toma-af", label: "Toma de agua fría", disc: "plum", sys: "af", h: 0.5, wall: false, circuit: "",
    ifc: { cls: "IFCVALVE", type: "ISOLATING" },
    draw: () => [circle(0, 0, 0.06, true, 12)],
  },
  {
    kind: "toma-ac", label: "Toma de agua caliente", disc: "plum", sys: "ac", h: 0.5, wall: false, circuit: "",
    ifc: { cls: "IFCVALVE", type: "ISOLATING" },
    draw: () => [circle(0, 0, 0.06, false, 12), circle(0, 0, 0.02, true, 8)],
  },
  {
    kind: "desague", label: "Desagüe de aparato", disc: "plum", sys: "san", h: 0, wall: false, circuit: "",
    ifc: { cls: "IFCWASTETERMINAL", type: "WASTETRAP" },
    draw: () => [circle(0, 0, 0.07, false, 14), ln(-0.07, 0, 0.07, 0)],
  },
  {
    kind: "sumidero", label: "Sumidero sifónico", disc: "plum", sys: "san", h: 0, wall: false, circuit: "",
    ifc: { cls: "IFCWASTETERMINAL", type: "FLOORTRAP" },
    draw: () => [rect(-0.1, -0.1, 0.1, 0.1), ln(-0.1, -0.1, 0.1, 0.1), ln(-0.1, 0.1, 0.1, -0.1)],
  },
  {
    kind: "bajante", label: "Bajante", disc: "plum", sys: "san", h: 0, wall: false, circuit: "", text: "B",
    ifc: { cls: "IFCPIPESEGMENT", type: "RIGIDSEGMENT" },
    draw: () => [circle(0, 0, 0.11, false, 18), circle(0, 0, 0.07, false, 14)],
  },
  {
    kind: "llave", label: "Llave de paso", disc: "plum", sys: "af", h: 0.4, wall: false, circuit: "",
    ifc: { cls: "IFCVALVE", type: "STOPCOCK" },
    draw: () => [{ pts: [{ x: -0.12, y: -0.07 }, { x: 0, y: 0 }, { x: -0.12, y: 0.07 }], closed: true, fill: true }, { pts: [{ x: 0.12, y: -0.07 }, { x: 0, y: 0 }, { x: 0.12, y: 0.07 }], closed: true, fill: true }],
  },
  {
    kind: "contador", label: "Contador de agua", disc: "plum", sys: "af", h: 0.4, wall: true, circuit: "", text: "CA",
    ifc: { cls: "IFCFLOWMETER", type: "WATERMETER" },
    draw: () => [rect(-0.18, -0.06, 0.18, 0.16)],
  },
  {
    kind: "registro", label: "Registro sanitario 40×60 cm", disc: "plum", sys: "san", h: 0, wall: false, circuit: "", text: "R",
    ifc: { cls: "IFCDISTRIBUTIONCHAMBERELEMENT", type: "INSPECTIONCHAMBER" },
    draw: () => [rect(-0.2, -0.3, 0.2, 0.3), rect(-0.14, -0.24, 0.14, 0.24)],
  },
  {
    kind: "tinaco", label: "Tinaco 1100 L", disc: "plum", sys: "af", h: 0, wall: false, circuit: "", text: "T",
    ifc: { cls: "IFCTANK", type: "STORAGE" },
    draw: () => [circle(0, 0, 0.55, false, 28), circle(0, 0, 0.5, false, 28)],
  },
  {
    kind: "termo", label: "Termo de agua caliente", disc: "plum", sys: "ac", h: 1.4, wall: true, circuit: "C4", text: "ACS",
    ifc: { cls: "IFCELECTRICAPPLIANCE", type: "FREESTANDINGWATERHEATER" },
    draw: () => [circle(0, 0.2, 0.25, false, 24)],
  },
];

export const mepDef = (kind: string) => MEP.find((d) => d.kind === kind) ?? MEP[0];
export const mepOf = (disc: Discipline) => MEP.filter((d) => d.disc === disc);
export const discOfSystem = (s: RunSystem): Discipline => (s === "elec" ? "elec" : "plum");

/** Redes de tuberías y canalizaciones. */
export const SYSTEMS: { id: RunSystem; label: string; color: string; dash: number[]; width: number }[] = [
  { id: "elec", label: "Canalización eléctrica", color: "#c77700", dash: [7, 3], width: 1 },
  { id: "af", label: "Agua fría", color: "#1f5fd1", dash: [], width: 1.4 },
  { id: "ac", label: "Agua caliente", color: "#d1352b", dash: [9, 3, 2, 3], width: 1.4 },
  { id: "san", label: "Saneamiento", color: "#7a4a22", dash: [], width: 2.6 },
];
export const systemDef = (s: RunSystem) => SYSTEMS.find((x) => x.id === s) ?? SYSTEMS[0];

/** Circuitos de una vivienda con electrificación básica (REBT, ITC-BT-25). */
export const CIRCUITS: Record<string, string> = {
  C1: "Iluminación",
  C2: "Tomas de uso general",
  C3: "Cocina y horno",
  C4: "Lavadora, lavavajillas y termo",
  C5: "Tomas de baño y cocina",
};

/** Trazos del símbolo ya colocados en planta. */
export function fixtureStrokes(f: Pick<Fixture, "kind" | "x" | "y" | "rot">): SymStroke[] {
  return mepDef(f.kind).draw().map((s) => ({ ...s, pts: s.pts.map((p) => furnitureToPlan(f, p)) }));
}

/** Centro del rótulo del símbolo, en planta. */
export function fixtureTextAt(f: Pick<Fixture, "kind" | "x" | "y" | "rot">): Pt {
  return furnitureToPlan(f, mepDef(f.kind).kind === "termo" ? { x: 0, y: 0.2 } : { x: 0, y: 0.02 });
}

/** ¿Se dibuja con la electricidad? Los de su disciplina y los aparatos de fontanería conectados a un circuito. */
export const isElectric = (f: Pick<Fixture, "kind" | "circuit">) => mepDef(f.kind).disc === "elec" || !!f.circuit;

/** Longitud de un recorrido. */
export function runLength(r: Pick<Run, "pts">) {
  let L = 0;
  for (let i = 1; i < r.pts.length; i++) L += Math.hypot(r.pts[i].x - r.pts[i - 1].x, r.pts[i].y - r.pts[i - 1].y);
  return L;
}

/**
 * Tomas de agua y desagües que necesita cada aparato sanitario, en coordenadas locales de la pieza
 * (el fondo, contra el muro, es el lado -y).
 */
const SANITARY_POINTS: Record<string, { kind: string; x: number; y: number }[]> = {
  wc: [{ kind: "toma-af", x: 0.16, y: -0.3 }, { kind: "desague", x: 0, y: -0.12 }],
  basin: [{ kind: "toma-af", x: -0.09, y: -0.17 }, { kind: "toma-ac", x: 0.09, y: -0.17 }, { kind: "desague", x: 0, y: -0.06 }],
  bath: [{ kind: "toma-af", x: -0.72, y: -0.24 }, { kind: "toma-ac", x: -0.72, y: -0.08 }, { kind: "desague", x: -0.6, y: 0 }],
  shower: [{ kind: "toma-af", x: -0.12, y: -0.38 }, { kind: "toma-ac", x: 0.12, y: -0.38 }, { kind: "sumidero", x: 0, y: 0 }],
  kitchen: [{ kind: "toma-af", x: -0.8, y: -0.22 }, { kind: "toma-ac", x: -0.6, y: -0.22 }, { kind: "desague", x: -0.7, y: -0.04 }],
};

/** Puntos de fontanería y saneamiento de una pieza de mobiliario (vacío si no es un aparato sanitario). */
export function sanitaryPoints(f: Furniture): { kind: string; x: number; y: number }[] {
  return (SANITARY_POINTS[f.kind] ?? []).map((q) => ({ kind: q.kind, ...furnitureToPlan(f, q) }));
}

/** ¿La pieza es un aparato que lleva agua? */
export const isSanitary = (f: Furniture) => f.kind in SANITARY_POINTS || furnitureDef(f.kind).ifc.cls === "IFCSANITARYTERMINAL";

/** Tramo en L de a a b: primero en horizontal y luego en vertical, como se trazan en los esquemas. */
function ell(a: Pt, b: Pt): Pt[] {
  const pts = [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }];
  return pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 1e-6);
}

/** Recorre los puntos en orden de vecino más próximo desde el origen y los une en cadena. */
function chain(src: Pt, pts: Pt[]): Pt[] {
  const left = [...pts], out: Pt[] = [{ x: src.x, y: src.y }];
  let cur = src;
  while (left.length) {
    let k = 0;
    left.forEach((p, i) => { if (Math.hypot(p.x - cur.x, p.y - cur.y) < Math.hypot(left[k].x - cur.x, left[k].y - cur.y)) k = i; });
    const nx = left.splice(k, 1)[0];
    out.push(...ell(cur, nx).slice(1));
    cur = nx;
  }
  return out;
}

/**
 * Traza de forma esquemática los recorridos de una disciplina y sustituye los que había:
 * en electricidad, un recorrido por circuito desde el cuadro; en fontanería, el agua fría desde la llave
 * de paso (o el contador), la caliente desde el termo y cada desagüe hasta la bajante más próxima.
 * Devuelve los recorridos nuevos (sin id).
 */
export function autoRoute(fixtures: Fixture[], disc: Discipline): Omit<Run, "id">[] {
  const fx = fixtures.filter((f) => mepDef(f.kind).disc === disc), kinds = (...k: string[]) => fx.filter((f) => k.includes(f.kind));
  const out: Omit<Run, "id">[] = [];
  if (disc === "elec") {
    const src = kinds("cuadro")[0];
    if (!src) return out;
    const byCircuit = new Map<string, Pt[]>();
    // también los aparatos de fontanería que llevan corriente (el termo)
    for (const f of fixtures) if (f !== src && f.circuit) byCircuit.set(f.circuit, [...(byCircuit.get(f.circuit) ?? []), f]);
    for (const c of [...byCircuit.keys()].sort()) out.push({ system: "elec", pts: chain(src, byCircuit.get(c)!) });
    return out;
  }
  const af = kinds("llave")[0] ?? kinds("contador")[0], ac = kinds("termo")[0], downs = kinds("bajante");
  const taps = kinds("toma-af"), hot = kinds("toma-ac");
  if (af && taps.length) out.push({ system: "af", pts: chain(af, ac ? [...taps, ac] : taps) });
  if (ac && hot.length) out.push({ system: "ac", pts: chain(ac, hot) });
  if (downs.length) for (const d of kinds("desague", "sumidero")) {
    const b = downs.reduce((m, x) => (Math.hypot(x.x - d.x, x.y - d.y) < Math.hypot(m.x - d.x, m.y - d.y) ? x : m));
    out.push({ system: "san", pts: ell(d, b) });
  }
  return out;
}

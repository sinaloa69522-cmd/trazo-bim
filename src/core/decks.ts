// Decks y porches: tipos, barandales (guards / handrails) y escalones de acceso, con las reglas del IRC
// (R507 decks, R311.7 escaleras, R312 barandales). Cada deck es un rectángulo entre dos esquinas; el lado
// que toca la casa lleva ledger y no lleva barandal.
import { distSeg, type P3, type Pt } from "./geometry";
import type { Member } from "./framing";
import { gradeLevel } from "./foundation";
import type { Deck, DeckKind, Project, RailKind, Wall } from "./model";
import { FT, IN } from "./units";

export interface DeckType {
  id: DeckKind;
  name: string;
  en: string;
  /** Color de la superficie en 3D y planta */
  color: string;
  /** Material de la superficie */
  surface: string;
  /** Lleva cubierta (porche) y, si screened, mosquitero entre columnas */
  roof: boolean;
  screened?: boolean;
  /** Losa de concreto en vez de entramado de madera */
  concrete?: boolean;
  /** Valores por defecto al dibujarlo */
  height: number;
  rail: RailKind;
}

export const DECK_TYPES: DeckType[] = [
  { id: "wood", name: "Deck de madera tratada", en: "P.T. wood deck", color: "#a97c50", surface: '5/4x6 P.T. decking', roof: false, height: 30 * IN, rail: "wood" },
  { id: "composite", name: "Deck de composite", en: "Composite deck", color: "#7d6655", surface: "Composite decking (Trex o similar)", roof: false, height: 30 * IN, rail: "metal" },
  { id: "ground", name: "Deck a ras de suelo", en: "Ground-level deck", color: "#b08a5c", surface: '5/4x6 P.T. decking', roof: false, height: 8 * IN, rail: "none" },
  { id: "covered", name: "Porche cubierto", en: "Covered porch", color: "#9a7652", surface: '1x4 T&G porch flooring', roof: true, height: 18 * IN, rail: "wood" },
  { id: "screened", name: "Porche con mosquitero", en: "Screened porch", color: "#94714d", surface: '1x4 T&G porch flooring', roof: true, screened: true, height: 18 * IN, rail: "wood" },
  { id: "stoop", name: "Porche de concreto (stoop)", en: "Concrete stoop / porch", color: "#bdb9b0", surface: '4" concrete slab', roof: false, concrete: true, height: 14 * IN, rail: "metal" },
];

export interface RailType { id: RailKind; name: string; en: string; color: string }
export const RAILS: RailType[] = [
  { id: "none", name: "Sin barandal", en: "No guard", color: "#000000" },
  { id: "wood", name: "Madera con balaustres 2x2", en: "Wood rail, 2x2 balusters @ 4\"", color: "#c49a6c" },
  { id: "metal", name: "Aluminio / metal", en: "Aluminum rail & balusters", color: "#2f3333" },
  { id: "cable", name: "Cable de acero", en: "Stainless cable rail", color: "#5d5f60" },
  { id: "glass", name: "Vidrio templado", en: "Tempered glass panels", color: "#a9c7cf" },
  { id: "vinyl", name: "Vinilo (PVC) blanco", en: "White vinyl rail", color: "#f2f2ee" },
];

export const deckType = (k: DeckKind | undefined) => DECK_TYPES.find((t) => t.id === k) ?? DECK_TYPES[0];
export const railType = (k: RailKind | undefined) => RAILS.find((t) => t.id === k) ?? RAILS[0];

/** Altura del barandal (guard) y de los pasamanos de las escaleras. */
export const GUARD_H = 36 * IN;
export const HANDRAIL_H = 36 * IN;
const MAX_RISER = 7.75 * IN, TREAD = 10 * IN, NOSING = 1 * IN;

export type Side = 0 | 1 | 2 | 3;
/** Nombre de cada lado tal como se ve en planta (y hacia abajo). */
export const SIDE_NAME = ["Arriba", "Derecha", "Abajo", "Izquierda"] as const;

export interface Steps { side: Side; n: number; riser: number; tread: number; run: number; width: number; a: Pt; b: Pt; out: Pt; along: Pt; treads: Pt[][] }

export interface DeckGeom {
  x0: number; y0: number; x1: number; y1: number;
  /** Lados en orden: arriba (y0), derecha (x1), abajo (y1), izquierda (x0), cada uno de a a b */
  edges: [Pt, Pt][];
  /** Lado pegado a la casa (ledger), si lo hay */
  house: Side | null;
  steps: Steps | null;
  /** Tramos de barandal (guard) sobre el borde: sin el lado de la casa ni el hueco de la escalera */
  guards: [Pt, Pt][];
  /** Pasamanos de la escalera (a ambos lados) con su arranque abajo: [arriba, abajo] */
  handrails: [P3, P3][];
  /** Barandal obligatorio: más de 30" sobre el terreno (R312.1.1) */
  guardRequired: boolean;
  /** Pasamanos obligatorio: 4 contrahuellas o más (R311.7.8) */
  handrailRequired: boolean;
}

const OUT: Pt[] = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];

export function deckGeom(d: Deck, walls: Wall[] = []): DeckGeom {
  const x0 = Math.min(d.x1, d.x2), x1 = Math.max(d.x1, d.x2), y0 = Math.min(d.y1, d.y2), y1 = Math.max(d.y1, d.y2);
  const edges: [Pt, Pt][] = [
    [{ x: x0, y: y0 }, { x: x1, y: y0 }], [{ x: x1, y: y0 }, { x: x1, y: y1 }],
    [{ x: x1, y: y1 }, { x: x0, y: y1 }], [{ x: x0, y: y1 }, { x: x0, y: y0 }],
  ];
  // el lado de la casa: el que tiene encima, en toda su mitad central, un muro a menos de medio metro
  let house: Side | null = null, best = Infinity;
  edges.forEach(([a, b], i) => {
    const ms = [0.25, 0.5, 0.75].map((t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }));
    const dist = Math.max(...ms.map((m) => Math.min(Infinity, ...walls.map((w) => distSeg(m.x, m.y, w.x1, w.y1, w.x2, w.y2).d - w.thick / 2))));
    if (dist < 0.5 && dist < best) { best = dist; house = i as Side; }
  });
  const H = Math.max(0, d.height), t = deckType(d.kind);
  let steps: Steps | null = null;
  const side = d.stairSide ?? null;
  if (side !== null && side !== house && H > 2 * IN) {
    const n = Math.max(1, Math.ceil(H / MAX_RISER - 1e-9)), riser = H / n, tread = t.concrete ? 11 * IN : TREAD;
    // los escalones bajan desde el borde: n contrahuellas y n-1 huellas fuera del deck, más el último peldaño en el suelo
    const run = (n - 1) * tread + tread;
    const [ea, eb] = edges[side], L = Math.hypot(eb.x - ea.x, eb.y - ea.y), along = { x: (eb.x - ea.x) / L, y: (eb.y - ea.y) / L };
    const width = Math.min(d.stairW ?? 3 * FT, L), c = Math.max(width / 2, Math.min(L - width / 2, (d.stairT ?? 0.5) * L));
    const a = { x: ea.x + along.x * (c - width / 2), y: ea.y + along.y * (c - width / 2) };
    const b = { x: ea.x + along.x * (c + width / 2), y: ea.y + along.y * (c + width / 2) };
    const out = OUT[side], treads: Pt[][] = [];
    for (let i = 0; i < n; i++) {
      const s0 = i * tread - (i ? NOSING : 0), s1 = (i + 1) * tread;
      treads.push([
        { x: a.x + out.x * s0, y: a.y + out.y * s0 }, { x: b.x + out.x * s0, y: b.y + out.y * s0 },
        { x: b.x + out.x * s1, y: b.y + out.y * s1 }, { x: a.x + out.x * s1, y: a.y + out.y * s1 },
      ]);
    }
    steps = { side, n, riser, tread, run, width, a, b, out, along, treads };
  }
  const guards: [Pt, Pt][] = [], handrails: [P3, P3][] = [];
  if (d.rail !== "none") {
    edges.forEach(([a, b], i) => {
      if (i === house) return;
      if (steps && steps.side === i) { guards.push([a, steps.a], [steps.b, b]); return; }
      guards.push([a, b]);
    });
    if (steps && steps.n >= 2) for (const p of [steps.a, steps.b]) {
      const inset = { x: p.x + (p === steps.a ? 1 : -1) * steps.along.x * 2 * IN, y: p.y + (p === steps.a ? 1 : -1) * steps.along.y * 2 * IN };
      const r = steps.run - steps.tread / 2;
      handrails.push([{ ...inset, z: H + HANDRAIL_H }, { x: inset.x + steps.out.x * r, y: inset.y + steps.out.y * r, z: steps.riser + HANDRAIL_H }]);
    }
  }
  // quita los tramos nulos
  const ok = (s: [Pt, Pt]) => Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y) > 0.05;
  return { x0, y0, x1, y1, edges, house, steps, guards: guards.filter(ok), handrails, guardRequired: H > 30 * IN, handrailRequired: !!steps && steps.n >= 4 };
}

/** Postes a lo largo de un tramo, a no más de `max` entre ejes, incluidos los extremos. */
export function along(a: Pt, b: Pt, max: number): Pt[] {
  const L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(L / max - 1e-9));
  return Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
}

// ---------- modelo 3D: cajas de color ----------

export interface Box { a: P3; b: P3; w: number; h: number; along?: Pt; color: string; opacity?: number }

const PT_COLOR = "#9c7a52", SCREEN = "#3b4146";

/**
 * Cajas del deck en 3D: superficie, faldón o postes, barandales, escalones con pasamanos y, en los porches,
 * columnas, viga y cubierta a un agua. e es la cota del nivel; las z van en metros absolutos.
 */
export function deckBoxes(d: Deck, walls: Wall[], e: number): Box[] {
  const g = deckGeom(d, walls), t = deckType(d.kind), rt = railType(d.rail), out: Box[] = [];
  const H = Math.max(0.02, d.height), top = e + H, th = t.concrete ? 4 * IN : 1 * IN;
  const cy = (g.y0 + g.y1) / 2, D = g.y1 - g.y0;
  // superficie (o losa de concreto hasta el suelo)
  const sh = t.concrete ? H : th;
  out.push({ a: { x: g.x0, y: cy, z: top - sh / 2 }, b: { x: g.x1, y: cy, z: top - sh / 2 }, w: D, h: sh, color: t.color });
  if (!t.concrete) {
    // faldón de borde (rim / fascia) y postes de 6x6 bajo la viga
    const rimH = Math.min(H - th, 9.25 * IN);
    if (rimH > 0.02) for (const [a, b] of g.edges) {
      const z = top - th - rimH / 2;
      out.push({ a: { ...a, z }, b: { ...b, z }, w: 1.5 * IN, h: rimH, color: PT_COLOR });
    }
    for (const p of postLine(g)) if (H - th - rimH > 0.05) out.push({ a: { ...p, z: e }, b: { ...p, z: top - th - rimH }, w: 5.5 * IN, h: 5.5 * IN, along: { x: 1, y: 0 }, color: PT_COLOR });
  }
  // barandales: postes a 6', pasamanos arriba, riel inferior y relleno según el tipo
  for (const [a, b] of g.guards) out.push(...rail(a, b, top, top, rt.id, rt.color));
  // escalones
  if (g.steps) {
    const s = g.steps;
    s.treads.forEach((q, i) => {
      const zt = top - (i + 1) * s.riser, c0 = { x: (q[0].x + q[3].x) / 2, y: (q[0].y + q[3].y) / 2 }, c1 = { x: (q[1].x + q[2].x) / 2, y: (q[1].y + q[2].y) / 2 };
      const depth = Math.hypot(q[3].x - q[0].x, q[3].y - q[0].y), hh = t.concrete ? zt - e + th : 1.5 * IN;
      if (zt + th - e < 0.01) return;
      out.push({ a: { ...c0, z: zt + th - hh / 2 }, b: { ...c1, z: zt + th - hh / 2 }, w: depth, h: hh, color: t.color });
    });
    if (!t.concrete) for (const p of [s.a, s.b]) {
      // zancas (stringers) de 2x12 a cada lado
      const end = { x: p.x + s.out.x * s.run, y: p.y + s.out.y * s.run };
      out.push({ a: { ...p, z: top - th - 5 * IN }, b: { ...end, z: e + 3 * IN }, w: 1.5 * IN, h: 11.25 * IN, color: PT_COLOR });
    }
    for (const [hi, lo] of g.handrails) out.push(...rail(hi, lo, hi.z - HANDRAIL_H, lo.z - HANDRAIL_H, rt.id, rt.color));
  }
  // porche: columnas en el borde exterior, viga y cubierta a un agua hacia fuera de la casa
  if (t.roof) out.push(...porchRoof(d, g, top));
  return out;
}

/** Línea de postes bajo el borde opuesto a la casa (o bajo los dos bordes largos si no hay casa), a 8' como máximo. */
function postLine(g: DeckGeom): Pt[] {
  const inset = 6 * IN, sides: Side[] = g.house !== null ? [((g.house + 2) % 4) as Side] : (g.x1 - g.x0 >= g.y1 - g.y0 ? [0, 2] : [1, 3]);
  const pts: Pt[] = [];
  for (const s of sides) {
    const [a, b] = g.edges[s], o = OUT[s];
    const L = Math.hypot(b.x - a.x, b.y - a.y), u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    pts.push(...along({ x: a.x - o.x * inset + u.x * inset, y: a.y - o.y * inset + u.y * inset }, { x: b.x - o.x * inset - u.x * inset, y: b.y - o.y * inset - u.y * inset }, 8 * FT));
  }
  return pts;
}

/** Barandal de a a b: postes, pasamanos, riel inferior y relleno (balaustres, cables, vidrio). za y zb son las cotas del piso en cada extremo. */
function rail(a: Pt, b: Pt, za: number, zb: number, kind: RailKind, color: string): Box[] {
  const out: Box[] = [], L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 0.05) return out;
  const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, z = (t: number) => za + (zb - za) * t;
  const post = kind === "wood" || kind === "vinyl" ? 3.5 * IN : 2 * IN, H = GUARD_H;
  for (const p of along(a, b, 6 * FT)) {
    const t = Math.hypot(p.x - a.x, p.y - a.y) / L;
    out.push({ a: { ...p, z: z(t) }, b: { ...p, z: z(t) + H + 1 * IN }, w: post, h: post, along: u, color });
  }
  const cap = kind === "glass" ? 2 * IN : 3.5 * IN;
  out.push({ a: { ...a, z: za + H }, b: { ...b, z: zb + H }, w: cap, h: 1.5 * IN, color });
  if (kind !== "cable") out.push({ a: { ...a, z: za + 3.5 * IN }, b: { ...b, z: zb + 3.5 * IN }, w: 1.5 * IN, h: 1.5 * IN, color });
  if (kind === "glass") {
    const zm = (za + zb) / 2;
    out.push({ a: { ...a, z: zm + 4.5 * IN + (H - 5 * IN) / 2 }, b: { ...b, z: zm + 4.5 * IN + (H - 5 * IN) / 2 }, w: 0.5 * IN, h: H - 6 * IN, color: "#a9c7cf", opacity: 0.35 });
  } else if (kind === "cable") {
    for (let k = 1; k * 3 * IN < H - 2 * IN; k++) out.push({ a: { ...a, z: za + k * 3 * IN }, b: { ...b, z: zb + k * 3 * IN }, w: 0.25 * IN, h: 0.25 * IN, color });
  } else {
    // balaustres a 4" libres (R312.1.3): uno cada 5 1/2" entre ejes
    const bw = kind === "metal" ? 0.75 * IN : 1.5 * IN, n = Math.floor(L / (5.5 * IN));
    for (let i = 1; i < n; i++) {
      const s = (L * i) / n, p = { x: a.x + u.x * s, y: a.y + u.y * s }, zz = z(s / L);
      out.push({ a: { ...p, z: zz + 5 * IN }, b: { ...p, z: zz + H - 0.75 * IN }, w: bw, h: bw, along: u, color });
    }
  }
  return out;
}

/** Cubierta del porche: columnas de 6x6 en el borde exterior, viga de 2x10 doble y faldón a 3:12 hacia fuera. */
function porchRoof(d: Deck, g: DeckGeom, top: number): Box[] {
  const out: Box[] = [], t = deckType(d.kind), hs = g.house ?? 0, os = ((hs + 2) % 4) as Side, o = OUT[os];
  const [a, b] = g.edges[os], inset = 4 * IN, clear = 8 * FT, pitch = 3 / 12, over = 12 * IN;
  const L = Math.hypot(b.x - a.x, b.y - a.y), u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
  const cols = along({ x: a.x - o.x * inset + u.x * inset, y: a.y - o.y * inset + u.y * inset }, { x: b.x - o.x * inset - u.x * inset, y: b.y - o.y * inset - u.y * inset }, 8 * FT);
  const zBeam = top + clear;
  for (const p of cols) out.push({ a: { ...p, z: top }, b: { ...p, z: zBeam }, w: 7 * IN, h: 7 * IN, along: u, color: "#f1efe9" });
  out.push({ a: { ...a, z: zBeam + 4.6 * IN }, b: { ...b, z: zBeam + 4.6 * IN }, w: 3.5 * IN, h: 9.25 * IN, color: "#f1efe9" });
  // faldón: del borde exterior (con su vuelo) a la casa, subiendo a 3:12
  const depth = os % 2 === 0 ? g.y1 - g.y0 : g.x1 - g.x0, run = depth + over;
  const lo = { x: (a.x + b.x) / 2 + o.x * over, y: (a.y + b.y) / 2 + o.y * over }, hi = { x: lo.x - o.x * run, y: lo.y - o.y * run };
  const z0 = zBeam + 9.25 * IN, z1 = z0 + run * pitch;
  out.push({ a: { ...lo, z: z0 }, b: { ...hi, z: z1 }, w: L + 2 * over, h: 4 * IN, color: "#6f6a64" });
  if (t.screened) {
    // mosquitero entre columnas en los lados abiertos
    g.edges.forEach(([p, q], i) => {
      if (i === g.house) return;
      const zm = (top + zBeam) / 2;
      out.push({ a: { ...p, z: zm }, b: { ...q, z: zm }, w: 0.2 * IN, h: zBeam - top, color: SCREEN, opacity: 0.28 });
    });
  }
  return out;
}

// ---------- estructura (framing) ----------

/**
 * Estructura del deck (R507): ledger contra la casa, viga doble sobre postes de 6x6 con zapata, viguetas de P.T.
 * a 16", vigas de borde, zancas de 2x12 y, en los porches, columnas, viga y cabios. Las losas de concreto
 * solo llevan su zapata perimetral.
 */
export function deckFraming(d: Deck, walls: Wall[], e: number): Member[] {
  const g = deckGeom(d, walls), t = deckType(d.kind), out: Member[] = [];
  const H = Math.max(0.02, d.height), top = e + H, th = 1 * IN, T = 1.5 * IN;
  const span = g.house !== null && g.house % 2 === 0 ? g.y1 - g.y0 : g.x1 - g.x0;
  if (t.concrete) {
    for (const [a, b] of g.edges) out.push({ kind: "footing", a: { ...a, z: e - 6 * IN }, b: { ...b, z: e - 6 * IN }, w: 12 * IN, h: 12 * IN, size: "THICKENED EDGE" });
    return out;
  }
  const js = span > 12 * FT ? "2x10" : "2x8", jd = (js === "2x10" ? 9.25 : 7.25) * IN, zj = top - th - jd / 2;
  // viguetas perpendiculares al lado de la casa (o a la luz corta)
  const across = g.house !== null ? g.house % 2 === 0 : g.x1 - g.x0 >= g.y1 - g.y0; // true: viguetas en y
  const [u0, u1] = across ? [g.x0, g.x1] : [g.y0, g.y1], [v0, v1] = across ? [g.y0, g.y1] : [g.x0, g.x1];
  const P = (u: number, v: number, z: number): P3 => (across ? { x: u, y: v, z } : { x: v, y: u, z });
  for (let u = u0 + T / 2; u <= u1 - T / 2 + 1e-6; u += 16 * IN) out.push({ kind: "floorJoist", a: P(u, v0 + T, zj), b: P(u, v1 - T, zj), w: T, h: jd, size: `${js} P.T.` });
  out.push({ kind: "floorJoist", a: P(u1 - T / 2, v0 + T, zj), b: P(u1 - T / 2, v1 - T, zj), w: T, h: jd, size: `${js} P.T.` });
  g.edges.forEach(([a, b], i) => {
    const off = { x: -OUT[i].x * T / 2, y: -OUT[i].y * T / 2 };
    out.push({ kind: i === g.house ? "rim" : "rim", a: { x: a.x + off.x, y: a.y + off.y, z: zj }, b: { x: b.x + off.x, y: b.y + off.y, z: zj }, w: T, h: jd, size: i === g.house ? `${js} P.T. LEDGER` : `${js} P.T. RIM` });
  });
  // viga doble bajo las viguetas y postes con su zapata
  const posts = postLine(g), zb = zj - jd / 2 - 9.25 * IN / 2;
  if (H - th - jd > 12 * IN) {
    const lines = g.house !== null ? [((g.house + 2) % 4) as Side] : (g.x1 - g.x0 >= g.y1 - g.y0 ? [0, 2] as Side[] : [1, 3] as Side[]);
    for (const s of lines) {
      const [a, b] = g.edges[s], o = OUT[s], k = 6 * IN;
      out.push({ kind: "girder", a: { x: a.x - o.x * k, y: a.y - o.y * k, z: zb }, b: { x: b.x - o.x * k, y: b.y - o.y * k, z: zb }, w: 3 * IN, h: 9.25 * IN, size: "(2) 2x10 P.T. BEAM" });
    }
    for (const p of posts) {
      out.push({ kind: "footing", a: { x: p.x - 9 * IN, y: p.y, z: e - 18 * IN }, b: { x: p.x + 9 * IN, y: p.y, z: e - 18 * IN }, w: 18 * IN, h: 10 * IN, size: '18" DIA. FOOTING' });
      out.push({ kind: "pier", a: { ...p, z: e - 13 * IN }, b: { ...p, z: zb - 9.25 * IN / 2 }, w: 5.5 * IN, h: 5.5 * IN, along: { x: 1, y: 0 }, size: "6x6 P.T. POST" });
    }
  }
  // zancas
  if (g.steps) for (const p of [g.steps.a, g.steps.b]) {
    const s = g.steps, end = { x: p.x + s.out.x * s.run, y: p.y + s.out.y * s.run };
    out.push({ kind: "stringer", a: { ...p, z: top - th - 5 * IN }, b: { ...end, z: e + 3 * IN }, w: T, h: 11.25 * IN, size: "2x12 P.T. STRINGER" });
  }
  // porche: columnas, viga y cabios a 24"
  if (t.roof) {
    const hs = g.house ?? 0, os = ((hs + 2) % 4) as Side, [a, b] = g.edges[os], o = OUT[os], zBeam = top + 8 * FT;
    const L = Math.hypot(b.x - a.x, b.y - a.y), u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    for (const p of along({ x: a.x - o.x * 4 * IN + u.x * 4 * IN, y: a.y - o.y * 4 * IN + u.y * 4 * IN }, { x: b.x - o.x * 4 * IN - u.x * 4 * IN, y: b.y - o.y * 4 * IN - u.y * 4 * IN }, 8 * FT))
      out.push({ kind: "pier", a: { ...p, z: top }, b: { ...p, z: zBeam }, w: 5.5 * IN, h: 5.5 * IN, along: u, size: "6x6 POST" });
    out.push({ kind: "header", a: { ...a, z: zBeam + 4.6 * IN }, b: { ...b, z: zBeam + 4.6 * IN }, w: 3 * IN, h: 9.25 * IN, size: "(2) 2x10 BEAM" });
    const depth = os % 2 === 0 ? g.y1 - g.y0 : g.x1 - g.x0, over = 12 * IN, run = depth + over, z0 = zBeam + 9.25 * IN + 2.75 * IN;
    for (let s = 12 * IN; s < L; s += 24 * IN) {
      const p = { x: a.x + u.x * s + o.x * over, y: a.y + u.y * s + o.y * over };
      out.push({ kind: "rafter", a: { ...p, z: z0 }, b: { x: p.x - o.x * run, y: p.y - o.y * run, z: z0 + run * 0.25 }, w: T, h: 5.5 * IN, size: "2x6" });
    }
  }
  return out;
}

/** Medidas para el presupuesto y las notas: superficie, metros de barandal y de pasamanos, escalones. */
export function deckTakeoff(d: Deck, walls: Wall[]) {
  const g = deckGeom(d, walls), len = (s: [Pt, Pt]) => Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y);
  return {
    area: (g.x1 - g.x0) * (g.y1 - g.y0),
    guard: g.guards.reduce((t, s) => t + len(s), 0),
    handrail: g.handrails.reduce((t, [a, b]) => t + Math.hypot(b.x - a.x, b.y - a.y), 0),
    risers: g.steps?.n ?? 0,
  };
}

/** Escalón entre el piso de la casa y el del deck pegado a ella (step-down de 1", para que no entre el agua). */
export const STEP_DOWN = 1 * IN;

/**
 * Los decks pegados a la casa toman la altura de su piso: 1" por debajo del piso terminado del nivel, medida
 * desde el terreno. Los exentos y los de altura fijada a mano no cambian. Devuelve si alguno cambió.
 */
export function fitDecks(p: Project): boolean {
  const gr = gradeLevel(p);
  let changed = false;
  for (const lv of p.levels) for (const d of lv.decks ?? []) {
    if (d.matchFloor === false || deckGeom(d, lv.walls).house === null) continue;
    const h = Math.max(0.05, lv.elev - gr - STEP_DOWN);
    if (Math.abs(d.height - h) > 1e-6) { d.height = h; changed = true; }
  }
  return changed;
}

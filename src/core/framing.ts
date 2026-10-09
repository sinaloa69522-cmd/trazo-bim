// Estructura de madera (wood framing) en 3D a partir del modelo: cimentación, soleras, montantes, dinteles,
// viguetas, cabios, limatesas y cumbrera, con los tamaños de predimensionado de permit.ts (tablas del IRC).
import { dir, loc, roofGeom, type P3 } from "./geometry";
import type { Project, Roof, Wall } from "./model";
import { deckFraming } from "./decks";
import { foundation, foundationType } from "./foundation";
import { ceilingSystem, depthOf, floorJoistDepth, floorSystem, SUBFLOOR } from "./joists";
import { floorJoist, headerSize, isExterior, rafterSize } from "./permit";
import { IN } from "./units";

export type MemberKind = "footing" | "foundation" | "pier" | "girder" | "slab" | "sill" | "rim" | "floorJoist" | "subfloor" | "blocking"
  | "plate" | "stud" | "header" | "ceilingJoist" | "rafter" | "collar" | "ridge" | "fascia" | "stringer";

/**
 * Pieza recta entre los centros de sus extremos a y b. w es su ancho horizontal y h su canto
 * (vertical, o perpendicular a la pendiente). Las piezas verticales (montantes) llevan along: la dirección
 * del muro, a lo largo de la cual se mide w.
 */
export interface Member { kind: MemberKind; a: P3; b: P3; w: number; h: number; along?: { x: number; y: number }; size: string }

/** Color de cada tipo de pieza en el 3D y en su leyenda. */
export const MEMBER_COLOR: Record<MemberKind, string> = {
  footing: "#b3b0a8", foundation: "#a7a49c", pier: "#9d9a92", girder: "#8f6436", slab: "#c4c1b9", sill: "#7f9a6a",
  rim: "#b9844a", floorJoist: "#d6ad74", subfloor: "#c8b48c", blocking: "#c08f55",
  plate: "#c99b62", stud: "#e2c08f", header: "#a8763f", ceilingJoist: "#e4c79a", rafter: "#d9b27c", collar: "#b98d58",
  ridge: "#9c6c3a", fascia: "#8a5f33", stringer: "#8e6a44",
};

const T = 1.5 * IN;
/** Canto real de una escuadría nominal ("2x8" → 7 1/4"). */
export const actualDepth = depthOf;
const nominal = (size: string) => /2x\d+/.exec(size)?.[0] ?? (/TJI/.test(size) ? "TJI" : "2x6");

/** Todas las piezas del proyecto. */
export function framing(p: Project): Member[] {
  // la cimentación (y el piso de madera si lo lleva) bajo la planta baja
  const out: Member[] = foundation(p);
  p.levels.forEach((lv, li) => {
    const e = lv.elev, above = p.levels[li + 1];
    // con una planta encima, su piso (viguetas, viga de borde, bloqueo y subpiso) acaba a la cota de esa planta
    // y los muros que llegan hasta ella se entraman solo hasta la cara inferior de las viguetas
    const D = above ? floorJoistDepth(lv) : 0, zb = above ? above.elev - SUBFLOOR - D : 0;
    const frameH = (w: Wall) => (above && w.height > zb - e - 0.15 ? zb - e : w.height);
    // sobre la losa (sin piso de madera) la solera inferior de la planta baja es un sill plate tratado (P.T.)
    const onSlab = li === 0 && !foundationType(p).framedFloor;
    for (const w of lv.walls) out.push(...wallFrame({ ...w, height: frameH(w) }, lv.openings.filter((o) => o.wallId === w.id), e, onSlab));
    // sobre la doble solera: el piso de la planta de arriba o, en la última planta, los ceiling joists
    const ceil = above ? [] : ceilingSystem(lv, e, frameH);
    out.push(...(above ? floorSystem(lv, zb, D) : ceil));
    // en los hastiales, los montantes arrancan sobre el rim joist del techo
    const rimH = Math.max(0, ...ceil.filter((m) => m.kind === "rim").map((m) => m.h));
    for (const r of lv.roofs) out.push(...roofFrame(r, e, lv.walls, rimH));
    for (const dk of lv.decks ?? []) out.push(...deckFraming(dk, lv.walls, e));
  });
  return out;
}

/** Entramado de un muro: solera inferior, doble solera superior, montantes a 16" y huecos con dintel. */
function wallFrame(w: Wall, ops: { t: number; width: number; height: number; sill: number; kind: string }[], e: number, onSlab = false): Member[] {
  const out: Member[] = [], { L, ux, uy } = dir(w), H = w.height, ext = isExterior(w);
  const D = Math.min(w.thick, ext ? 5.5 * IN : 3.5 * IN), size = ext ? "2x6" : "2x4", along = { x: ux, y: uy };
  const plate = (z: number) => out.push({ kind: "plate", a: { ...loc(w, 0, 0), z }, b: { ...loc(w, L, 0), z }, w: D, h: T, size });
  if (onSlab) out.push({ kind: "sill", a: { ...loc(w, 0, 0), z: e + T / 2 }, b: { ...loc(w, L, 0), z: e + T / 2 }, w: D, h: T, size: `P.T. ${size} SILL` });
  else plate(e + T / 2);
  plate(e + H - T / 2); plate(e + H - 1.5 * T);
  const stud = (s: number, z0: number, z1: number) => {
    if (z1 - z0 > 0.02) out.push({ kind: "stud", a: { ...loc(w, s, 0), z: z0 }, b: { ...loc(w, s, 0), z: z1 }, w: T, h: D, along, size });
  };
  const zb = e + T, zt = e + H - 2 * T;
  const spans = ops.map((o) => {
    const c = o.t * L, a = c - o.width / 2, b = c + o.width / 2, top = Math.min(H - 2 * T - 0.05, o.sill + o.height);
    const hs = ext ? headerSize(o.width) : "(2) 2x6", hd = actualDepth(/LVL/.test(hs) ? "2x12" : hs);
    return { a, b, top, sill: o.sill, window: o.kind === "window", hs, hd };
  });
  // montantes comunes a 16" que no caen en un hueco (con su marco)
  for (let s = T / 2; s <= L - T / 2 + 1e-6; s += 16 * IN) {
    const hit = spans.find((o) => s > o.a - 2 * T && s < o.b + 2 * T);
    if (!hit) { stud(s, zb, zt); continue; }
    if (s <= hit.a || s >= hit.b) continue;
    // cojinetes (cripples) sobre el dintel y bajo el antepecho
    stud(s, e + hit.top + hit.hd, zt);
    if (hit.window && hit.sill > 0.1) stud(s, zb, e + hit.sill - T);
  }
  stud(L - T / 2, zb, zt);
  for (const o of spans) {
    // king (hasta arriba) y jack (bajo el dintel) a cada lado
    stud(o.a - 1.5 * T, zb, zt); stud(o.b + 1.5 * T, zb, zt);
    stud(o.a - T / 2, zb, e + o.top); stud(o.b + T / 2, zb, e + o.top);
    const zh = e + o.top + o.hd / 2;
    out.push({ kind: "header", a: { ...loc(w, o.a - T, 0), z: zh }, b: { ...loc(w, o.b + T, 0), z: zh }, w: D, h: o.hd, size: o.hs });
    if (o.window && o.sill > 0.1) { const z = e + o.sill - T / 2; out.push({ kind: "plate", a: { ...loc(w, o.a, 0), z }, b: { ...loc(w, o.b, 0), z }, w: D, h: T, size }); }
  }
  return out;
}

/** Cabios a 24", cumbrera y limatesas (o viguetas de cubierta plana), bajo la cara superior del faldón. */
function roofFrame(r: Roof, e: number, walls: Wall[], gableBase = 0): Member[] {
  const out: Member[] = [], g = roofGeom(r);
  // apoyo: la cara superior de la doble solera de los muros exteriores bajo la cubierta (si los hay), para que
  // los cabios queden siempre encima aunque el arranque de la cubierta no coincida con la altura de los muros
  const rx0 = Math.min(r.x1, r.x2) - 0.05, rx1 = Math.max(r.x1, r.x2) + 0.05, ry0 = Math.min(r.y1, r.y2) - 0.05, ry1 = Math.max(r.y1, r.y2) + 0.05;
  const under = walls.filter((w) => isExterior(w) && [[w.x1, w.y1], [w.x2, w.y2]].every(([x, y]) => x >= rx0 && x <= rx1 && y >= ry0 && y <= ry1));
  const seat = under.length ? Math.max(r.base, ...under.map((w) => w.height)) : r.base;
  // el talón del corte de asiento cae en la cara exterior de la solera
  const heel = under.length ? Math.max(...under.map((w) => Math.min(w.thick, 5.5 * IN))) / 2 : 0;
  const xs = g.outline.map((q) => q.x), ys = g.outline.map((q) => q.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const alongX = x1 - x0 >= y1 - y0, U0 = alongX ? x0 : y0, U1 = alongX ? x1 : y1, V0 = alongX ? y0 : x0, V1 = alongX ? y1 : x1;
  const P = (u: number, v: number, z: number): P3 => (alongX ? { x: u, y: v, z } : { x: v, y: u, z });
  const short = V1 - V0, s = 24 * IN;
  if (r.kind === "flat") {
    // viguetas de cubierta apoyadas sobre la doble solera (el arranque)
    const m = floorJoist(short), d = actualDepth(m), z = e + seat + d / 2;
    for (let u = U0 + s / 2; u < U1; u += s) out.push({ kind: "rafter", a: P(u, V0, z), b: P(u, V1, z), w: T, h: d, size: nominal(m) });
    return out;
  }
  const tan = Math.tan((Math.max(1, Math.min(75, r.pitch)) * Math.PI) / 180), half = short / 2, vm = (V0 + V1) / 2;
  const m = rafterSize(half), d = actualDepth(/TRUSS/.test(m) ? "2x8" : m), z0 = e + seat - (r.overhang - heel) * tan;
  // el plano del arranque pasa por la cara superior de la doble solera: los cabios se apoyan en ella
  // (con su corte de asiento), así que su eje va medio canto por encima de ese plano
  const drop = d / 2 / Math.cos(Math.atan(tan));
  const Z = (dv: number) => z0 + dv * tan + drop;
  const hip = r.kind === "hip", inset = hip ? Math.min(half, (U1 - U0) / 2) : 0;
  const rafter = (a: P3, b: P3) => out.push({ kind: "rafter", a, b, w: T, h: d, size: nominal(m) });
  for (let u = U0 + s / 2; u < U1; u += s) {
    // en las cubiertas a cuatro aguas los cabios de los extremos mueren en la limatesa
    const reach = hip ? Math.min(half, u - U0, U1 - u) : half;
    rafter(P(u, V0, Z(0)), P(u, V0 + reach, Z(reach)));
    rafter(P(u, V1, Z(0)), P(u, V1 - reach, Z(reach)));
  }
  if (hip) for (let v = V0 + s / 2; v < V1; v += s) {
    const reach = Math.min(v - V0, V1 - v, inset);
    rafter(P(U0, v, Z(0)), P(U0 + reach, v, Z(reach)));
    rafter(P(U1, v, Z(0)), P(U1 - reach, v, Z(reach)));
  }
  // collar ties a 48" (un par de cabios sí y otro no), en el tercio superior, junto a la cara del cabio
  const cd = depthOf("2x6"), dvc = (half * 2) / 3;
  let k = 0;
  for (let u = U0 + s / 2; u < U1; u += s, k++) {
    if (k % 2 || (hip && Math.min(u - U0, U1 - u) < half)) continue;
    const z = Z(dvc) - drop + cd / 2, uc = u + T;
    out.push({ kind: "collar", a: P(uc, V0 + dvc, z), b: P(uc, V1 - dvc, z), w: T, h: cd, size: "2x6" });
  }
  // fascia en la punta de los cabios del alero (en los cuatro lados si es a cuatro aguas)
  const ft = Z(0), fz = ft + drop - d / 2;
  const fascia = (p: P3, q: P3) => out.push({ kind: "fascia", a: p, b: q, w: T, h: d, size: `${nominal(m)} FASCIA` });
  fascia(P(U0, V0, fz), P(U1, V0, fz)); fascia(P(U0, V1, fz), P(U1, V1, fz));
  if (hip) { fascia(P(U0, V0, fz), P(U0, V1, fz)); fascia(P(U1, V0, fz), P(U1, V1, fz)); }
  // montantes del hastial, sobre la línea del muro, hasta la cara inferior de los cabios
  if (!hip) {
    const along = alongX ? { x: 0, y: 1 } : { x: 1, y: 0 }, o = r.overhang, zb = e + seat + gableBase;
    for (const u of [U0 + o, U1 - o]) for (let v = V0 + o + 16 * IN; v < V1 - o - 0.05; v += 16 * IN) {
      const top = Z(Math.min(v - V0, V1 - v)) - drop;
      if (top - zb > 0.05) out.push({ kind: "stud", a: P(u, v, zb), b: P(u, v, top), w: T, h: 3.5 * IN, along, size: "2x4" });
    }
  }
  // cumbrera dos escuadrías más alta que los cabios; limatesas iguales
  const rs = nominal(m).replace(/2x(\d+)/, (_, n) => `2x${Math.min(14, Number(n) + 2)}`), rd = actualDepth(rs);
  // cumbrera enrasada por arriba con los cabios
  const zr = z0 + half * tan + 2 * drop - rd / 2;
  if (U1 - inset - (U0 + inset) > 1e-3) out.push({ kind: "ridge", a: P(U0 + inset, vm, zr), b: P(U1 - inset, vm, zr), w: T, h: rd, size: rs });
  if (hip) for (const [u, ue] of [[U0, U0 + inset], [U1, U1 - inset]]) for (const v of [V0, V1])
    out.push({ kind: "ridge", a: P(u, v, Z(0)), b: P(ue, vm, Z(half)), w: T, h: rd, size: rs });
  return out;
}

/** Resumen por tipo de pieza y escuadría, con los metros lineales. */
export function framingTakeoff(ms: Member[]) {
  const t = new Map<string, { kind: MemberKind; size: string; count: number; length: number }>();
  for (const m of ms) {
    const k = `${m.kind}|${m.size}`, L = Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y, m.b.z - m.a.z);
    const r = t.get(k) ?? { kind: m.kind, size: m.size, count: 0, length: 0 };
    r.count++; r.length += L; t.set(k, r);
  }
  return [...t.values()];
}

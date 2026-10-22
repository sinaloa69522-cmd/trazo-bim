// Estructura de madera (wood framing) en 3D a partir del modelo: cimentación, soleras, montantes, dinteles,
// viguetas, cabios, limatesas y cumbrera, con los tamaños de predimensionado de permit.ts (tablas del IRC).
import { dir, loc, roofAlongX, roofGeom, shedLowV1, type P3 } from "./geometry";
import type { Dormer, Project, Roof, Stair, Wall } from "./model";
import { dormerGeom, frontWindow, sideWindow } from "./dormers";
import { deckFraming } from "./decks";
import { foundation, foundationType, gradeLevel } from "./foundation";
import { ceilingSystem, depthOf, floorJoistDepth, floorSystem, SUBFLOOR } from "./joists";
import { floorJoist, headerSize, isExterior, rafterSize } from "./permit";
import { POST_R, stairFlights, stairGeom } from "./stairs";
import { IN } from "./units";

export type MemberKind = "footing" | "foundation" | "pier" | "girder" | "slab" | "sill" | "rim" | "floorJoist" | "subfloor" | "blocking"
  | "plate" | "stud" | "header" | "ceilingJoist" | "rafter" | "collar" | "ridge" | "fascia" | "stringer" | "tread";

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
  ridge: "#9c6c3a", fascia: "#8a5f33", stringer: "#8e6a44", tread: "#cf9f62",
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
    for (const w of lv.walls) out.push(...wallFrame({ ...w, height: frameH(w) }, lv.openings.filter((o) => o.wallId === w.id), e, onSlab, isExterior(w, 0, lv.walls)));
    // sobre la doble solera: el piso de la planta de arriba o, en la última planta, los ceiling joists
    const ceil = above ? [] : ceilingSystem(lv, e, frameH);
    // el piso de arriba deja el hueco de la escalera (y los huecos de su losa) con brochales y viguetas dobles
    const holes = above ? [...lv.stairs.map((s) => stairGeom(s).outline), ...above.slabs.flatMap((sl) => sl.holes)] : [];
    out.push(...(above ? floorSystem(lv, zb, D, holes) : ceil));
    for (const s of lv.stairs) out.push(...stairFrame(s, e));
    // en los hastiales, los montantes arrancan sobre el rim joist del techo
    const rimH = Math.max(0, ...ceil.filter((m) => m.kind === "rim").map((m) => m.h));
    for (const r of lv.roofs) out.push(...roofFrame(r, e, lv.walls, rimH));
    for (const dk of lv.decks ?? []) out.push(...deckFraming(dk, lv.walls, gradeLevel(p)));
  });
  return out;
}

/** Entramado de un muro: solera inferior, doble solera superior, montantes a 16" y huecos con dintel. */
function wallFrame(w: Wall, ops: { t: number; width: number; height: number; sill: number; kind: string }[], e: number, onSlab = false, ext = isExterior(w)): Member[] {
  const out: Member[] = [], { L, ux, uy } = dir(w), H = w.height;
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
  const under = walls.filter((w) => isExterior(w, 0, walls) && [[w.x1, w.y1], [w.x2, w.y2]].every(([x, y]) => x >= rx0 && x <= rx1 && y >= ry0 && y <= ry1));
  const seat = under.length ? Math.max(r.base, ...under.map((w) => w.height)) : r.base;
  // el talón del corte de asiento cae en la cara exterior de la solera
  const heel = under.length ? Math.max(...under.map((w) => Math.min(w.thick, 5.5 * IN))) / 2 : 0;
  const xs = g.outline.map((q) => q.x), ys = g.outline.map((q) => q.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const alongX = roofAlongX(r), U0 = alongX ? x0 : y0, U1 = alongX ? x1 : y1, V0 = alongX ? y0 : x0, V1 = alongX ? y1 : x1;
  const P = (u: number, v: number, z: number): P3 => (alongX ? { x: u, y: v, z } : { x: v, y: u, z });
  const short = V1 - V0, s = 24 * IN;
  if (r.kind === "flat") {
    // viguetas de cubierta apoyadas sobre la doble solera (el arranque)
    const m = floorJoist(short), d = actualDepth(m), z = e + seat + d / 2;
    for (let u = U0 + s / 2; u < U1; u += s) out.push({ kind: "rafter", a: P(u, V0, z), b: P(u, V1, z), w: T, h: d, size: nominal(m) });
    return out;
  }
  if (r.kind === "shed") return shedFrame(r, e + seat, e + seat + gableBase, heel, alongX, P, U0, U1, V0, V1);
  const tan = Math.tan((Math.max(1, Math.min(75, r.pitch)) * Math.PI) / 180), half = short / 2, vm = (V0 + V1) / 2;
  const m = rafterSize(half), d = actualDepth(/TRUSS/.test(m) ? "2x8" : m), z0 = e + seat - (r.overhang - heel) * tan;
  // el plano del arranque pasa por la cara superior de la doble solera: los cabios se apoyan en ella
  // (con su corte de asiento), así que su eje va medio canto por encima de ese plano
  const drop = d / 2 / Math.cos(Math.atan(tan));
  const Z = (dv: number) => z0 + dv * tan + drop;
  const hip = r.kind === "hip", inset = hip ? Math.min(half, (U1 - U0) / 2) : 0;
  const rafter = (a: P3, b: P3) => out.push({ kind: "rafter", a, b, w: T, h: d, size: nominal(m) });
  // buhardillas: hueco en el faldón entre dos cabios dobles (trimmers) y dos brochales dobles (headers)
  const o = r.overhang, holes = (r.dormers ?? []).filter((dm) => dormerGeom(r, dm)).map((dm) => {
    const um = (U0 + U1) / 2 + dm.u, back = dm.kind === "gable" ? dm.set + dm.h / tan + dm.w / 2 : dm.set + dm.h / (tan - tan / 3);
    return { dm, side: dm.side, u0: um - dm.w / 2, u1: um + dm.w / 2, um, f: o + dm.set, b: o + back };
  });
  /** Punto a la distancia dv del alero, en el faldón de un lado (0: V0, 1: V1). */
  const S = (side: number, u: number, dv: number, z: number) => P(u, side ? V1 - dv : V0 + dv, z);
  for (let u = U0 + s / 2; u < U1; u += s) {
    // en las cubiertas a cuatro aguas los cabios de los extremos mueren en la limatesa
    const reach = hip ? Math.min(half, u - U0, U1 - u) : half;
    for (const side of [0, 1]) {
      const hl = holes.find((x) => x.side === side && u > x.u0 - T && u < x.u1 + T);
      if (!hl) { rafter(S(side, u, 0, Z(0)), S(side, u, reach, Z(reach))); continue; }
      // cabio cortado por el hueco: tramo del alero al brochal de abajo y del brochal de arriba a la cumbrera
      rafter(S(side, u, 0, Z(0)), S(side, u, hl.f - T, Z(hl.f - T)));
      if (hl.b + T < reach) rafter(S(side, u, hl.b + T, Z(hl.b + T)), S(side, u, reach, Z(reach)));
    }
  }
  for (const hl of holes) out.push(...dormerFrame(hl, S, Z, drop, tan, d, nominal(m), half));
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

/**
 * Cubierta de un agua: cabios a 24" de alero a alero de un solo tramo, fascia en los dos aleros y montantes
 * en los hastiales trapeciales y en el muro piñón del lado alto, hasta la cara inferior de los cabios.
 */
function shedFrame(r: Roof, zs: number, zb: number, heel: number, alongX: boolean, P: (u: number, v: number, z: number) => P3, U0: number, U1: number, V0: number, V1: number): Member[] {
  const out: Member[] = [], s = 24 * IN, o = r.overhang, short = V1 - V0, lowV1 = shedLowV1(r);
  const tan = Math.tan((Math.max(1, Math.min(75, r.pitch)) * Math.PI) / 180);
  const m = rafterSize(short), d = actualDepth(/TRUSS/.test(m) ? "2x8" : m), drop = d / 2 / Math.cos(Math.atan(tan));
  const z0 = zs - (o - heel) * tan, Z = (v: number) => z0 + (lowV1 ? V1 - v : v - V0) * tan + drop;
  for (let u = U0 + s / 2; u < U1; u += s) out.push({ kind: "rafter", a: P(u, V0, Z(V0)), b: P(u, V1, Z(V1)), w: T, h: d, size: nominal(m) });
  for (const v of [V0, V1]) out.push({ kind: "fascia", a: P(U0, v, Z(v) + drop - d / 2), b: P(U1, v, Z(v) + drop - d / 2), w: T, h: d, size: `${nominal(m)} FASCIA` });
  const stud = (u: number, v: number, along: { x: number; y: number }) => {
    const top = Z(v) - drop;
    if (top - zb > 0.05) out.push({ kind: "stud", a: P(u, v, zb), b: P(u, v, top), w: T, h: 3.5 * IN, along, size: "2x4" });
  };
  const acrossV = alongX ? { x: 0, y: 1 } : { x: 1, y: 0 }, alongU = alongX ? { x: 1, y: 0 } : { x: 0, y: 1 };
  for (const u of [U0 + o, U1 - o]) for (let v = V0 + o + 16 * IN; v < V1 - o - 0.05; v += 16 * IN) stud(u, v, acrossV);
  const vh = lowV1 ? V0 + o : V1 - o;
  for (let u = U0 + o + 16 * IN; u < U1 - o - 0.05; u += 16 * IN) stud(u, vh, alongU);
  return out;
}

type Hole = { dm: Dormer; side: number; u0: number; u1: number; um: number; f: number; b: number };

/**
 * Entramado de una buhardilla: cabios dobles a los lados del hueco y brochales dobles arriba y abajo,
 * montantes del frente (con el dintel de la ventana) y de los costados, soleras y los cabios de su techito.
 */
function dormerFrame(hl: Hole, S: (side: number, u: number, dv: number, z: number) => P3, Z: (dv: number) => number, drop: number, tan: number, d: number, size: string, half: number): Member[] {
  const out: Member[] = [], { dm, side, u0, u1, um, f, b } = hl;
  const top = (dv: number) => Z(dv) + drop;
  // hueco: trimmers de alero a cumbrera junto a cada lado y brochales dobles entre ellos
  for (const u of [u0 - T / 2, u1 + T / 2]) out.push({ kind: "rafter", a: S(side, u, 0, Z(0)), b: S(side, u, half, Z(half)), w: T, h: d, size });
  for (const dv of [f - T / 2, Math.min(b, half - T) + T / 2]) out.push({ kind: "header", a: S(side, u0, dv, Z(dv)), b: S(side, u1, dv, Z(dv)), w: 2 * T, h: d, size: `(2) ${size}` });
  // frente: solera sobre el brochal, montantes a 16" y doble solera arriba, a la altura del frente
  const zf = top(f), ze = zf + dm.h, st = 3.5 * IN, alongU = { x: S(side, 1, 0, 0).x - S(side, 0, 0, 0).x, y: S(side, 1, 0, 0).y - S(side, 0, 0, 0).y };
  const fv = f + st / 2;
  const plate = (a: P3, c: P3) => out.push({ kind: "plate", a, b: c, w: st, h: T, size: "2x4" });
  const stud = (a: P3, c: P3, along = alongU) => { if (c.z - a.z > 0.05) out.push({ kind: "stud", a, b: c, w: T, h: st, along, size: "2x4" }); };
  plate(S(side, u0, fv, zf + T / 2), S(side, u1, fv, zf + T / 2));
  plate(S(side, u0, fv, ze - T / 2), S(side, u1, fv, ze - T / 2)); plate(S(side, u0, fv, ze - 1.5 * T), S(side, u1, fv, ze - 1.5 * T));
  // ventana como en dormers.ts: ancho del frente menos 40 cm, antepecho de 15 cm y dintel 12 cm bajo el frente
  const fw = frontWindow(dm, zf, ze), win = !!fw, ww = fw?.w ?? 0, wa = um - ww / 2, wb = um + ww / 2, sill = fw?.sill ?? 0, head = fw?.head ?? 0;
  const hd = Math.min(depthOf("2x6"), Math.max(0.05, ze - 2 * T - head - 0.02));
  const us: number[] = [u0 + T / 2];
  for (let u = u0 + 16 * IN; u < u1 - T; u += 16 * IN) us.push(u);
  us.push(u1 - T / 2);
  for (const u of us) {
    const inWin = win && u > wa - T && u < wb + T;
    if (!inWin) stud(S(side, u, fv, zf + T), S(side, u, fv, ze - 2 * T));
    else { stud(S(side, u, fv, zf + T), S(side, u, fv, sill - T)); stud(S(side, u, fv, head + hd), S(side, u, fv, ze - 2 * T)); }
  }
  if (win) {
    for (const u of [wa - T / 2, wb + T / 2]) stud(S(side, u, fv, zf + T), S(side, u, fv, head));
    out.push({ kind: "header", a: S(side, wa - T, fv, head + hd / 2), b: S(side, wb + T, fv, head + hd / 2), w: st, h: hd, size: "(2) 2x6" });
    plate(S(side, wa, fv, sill - T / 2), S(side, wb, fv, sill - T / 2));
  }
  // costados: montantes a 16" sobre el trimmer, del faldón a la doble solera
  const tan2 = dm.kind === "gable" ? 0 : tan / 3, de = dm.kind === "gable" ? f + dm.h / tan : b;
  const zTop = (dv: number) => ze + (dv - f) * tan2;
  const alongV = { x: S(side, 0, 1, 0).x - S(side, 0, 0, 0).x, y: S(side, 0, 1, 0).y - S(side, 0, 0, 0).y };
  for (const u of [u0 + st / 2, u1 - st / 2]) {
    out.push({ kind: "plate", a: S(side, u, f, zTop(f) - T / 2), b: S(side, u, de, zTop(de) - T / 2), w: st, h: T, size: "2x4" });
    // ventana del costado: montantes a sus lados, dintel y antepecho; ningún montante cruza el vano
    const sw = sideWindow(dm, zf, ze, tan);
    for (let dv = f + 16 * IN; dv < de - 0.1; dv += 16 * IN) {
      if (sw && dv > f + sw.t1 - dm.set - T && dv < f + sw.t2 - dm.set + T) continue;
      stud(S(side, u, dv, top(dv)), S(side, u, dv, zTop(dv) - T), alongV);
    }
    if (sw) {
      const a = f + sw.t1 - dm.set, c = f + sw.t2 - dm.set;
      for (const dv of [a - T / 2, c + T / 2]) stud(S(side, u, dv, top(dv)), S(side, u, dv, zTop(dv) - T), alongV);
      out.push({ kind: "header", a: S(side, u, a - T, sw.head + T), b: S(side, u, c + T, sw.head + T), w: st, h: 2 * T, size: "(2) 2x4" });
      out.push({ kind: "plate", a: S(side, u, a, sw.sill - T / 2), b: S(side, u, c, sw.sill - T / 2), w: st, h: T, size: "2x4" });
    }
  }
  // techito: a dos aguas, cumbrera y pares de cabios a 16" que en la limahoya mueren contra el faldón
  const rd = depthOf("2x6"), dr = 0.5 * rd / Math.cos(Math.atan(tan));
  if (dm.kind === "gable") {
    const zr = ze + (dm.w / 2) * tan;
    out.push({ kind: "ridge", a: S(side, um, f - 0.15, zr - dr), b: S(side, um, b, zr - dr), w: T, h: depthOf("2x8"), size: "2x8" });
    for (let dv = f - 0.15 + T / 2; dv < b - 0.05; dv += 16 * IN) {
      const hw = Math.min(dm.w / 2 + 0.1, b - dv);
      if (hw < 0.1) continue;
      for (const sg of [-1, 1]) out.push({ kind: "rafter", a: S(side, um + sg * hw, dv, zr - hw * tan), b: S(side, um, dv, zr), w: T, h: rd, size: "2x6" });
    }
  } else {
    // de un agua: cabios a lo largo de la pendiente, del frente al faldón
    for (let u = u0 + T / 2; u < u1 + T; u += 16 * IN) {
      const uu = Math.min(u, u1 - T / 2);
      out.push({ kind: "rafter", a: S(side, uu, f - 0.15, zTop(f - 0.15) + dr), b: S(side, uu, b, zTop(b) + dr), w: T, h: rd, size: "2x6" });
    }
  }
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

/**
 * Escalera de madera: tres zancas de 2x12 por tramo (dos si es angosta), huellas de 2x12 con 1" de vuelo,
 * contrahuellas de 1x8 y, en cada descanso, plataforma de 2x8 sobre postes de 4x4 con su tablero.
 * El caracol: poste central y peldaños volados.
 */
export function stairFrame(s: Stair, e: number): Member[] {
  const out: Member[] = [], fs = stairFlights(s), RISER = 0.75 * IN, NOSE = 1 * IN, SH = 11.25 * IN;
  if (!fs) {
    const g = stairGeom(s), c = { x: s.x1, y: s.y1 };
    out.push({ kind: "stringer", a: { ...c, z: e }, b: { ...c, z: e + s.height }, w: POST_R * 2, h: POST_R * 2, along: { x: 1, y: 0 }, size: "STEEL POST" });
    for (const pc of g.pieces.filter((p) => p.part === "step")) {
      // de la cara del poste al borde, por la mitad del peldaño
      const far = pc.pts.reduce((m, p) => (Math.hypot(p.x - c.x, p.y - c.y) > Math.hypot(m.x - c.x, m.y - c.y) ? p : m), pc.pts[0]);
      const mid = { x: pc.pts.reduce((t, p) => t + p.x, 0) / pc.pts.length, y: pc.pts.reduce((t, p) => t + p.y, 0) / pc.pts.length };
      const ang = Math.atan2(mid.y - c.y, mid.x - c.x), R = Math.hypot(far.x - c.x, far.y - c.y), at = (r: number) => ({ x: c.x + Math.cos(ang) * r, y: c.y + Math.sin(ang) * r });
      const wd = Math.max(0.15, (pc.pts.length > 2 ? Math.hypot(pc.pts[1].x - pc.pts[pc.pts.length - 1].x, pc.pts[1].y - pc.pts[pc.pts.length - 1].y) : 0.2) * 0.6);
      out.push({ kind: "tread", a: { ...at(POST_R), z: e + pc.z - T / 2 }, b: { ...at(R), z: e + pc.z - T / 2 }, w: wd, h: T, size: "2x12 TREAD" });
    }
    return out;
  }
  const add = (p: { x: number; y: number }, q: { x: number; y: number }, k: number) => ({ x: p.x + q.x * k, y: p.y + q.y * k });
  for (const f of fs.flights) {
    if (f.k < 1) continue;
    const base = e + f.i0 * f.r, th = Math.atan2(f.r, f.t), off = SH / 2 / Math.cos(th);
    for (let j = 0; j < f.k; j++) {
      const zt = base + (j + 1) * f.r;
      out.push({ kind: "tread", a: { ...add(f.a, f.u, j * f.t - NOSE), z: zt - T / 2 }, b: { ...add(f.a, f.u, (j + 1) * f.t), z: zt - T / 2 }, w: f.w, h: T, size: "2x12 TREAD" });
      const rc = add(f.a, f.u, j * f.t + RISER / 2), zr = base + j * f.r + (f.r - T) / 2;
      out.push({ kind: "tread", a: { ...add(rc, f.v, -f.w / 2), z: zr }, b: { ...add(rc, f.v, f.w / 2), z: zr }, w: RISER, h: f.r - T, size: "1x8 RISER" });
    }
    // eje de la zanca: su canto superior toca la cara inferior de las huellas por detrás; arranca apoyada en el piso
    const zc = (x: number) => base + (x * f.r) / f.t - T - off, s0 = ((T + off) * f.t) / f.r, s1 = f.k * f.t;
    if (s1 <= s0) continue;
    const cs = f.w > 0.9 ? [-f.w / 2 + T / 2, 0, f.w / 2 - T / 2] : [-f.w / 2 + T / 2, f.w / 2 - T / 2];
    for (const c of cs) {
      const p0 = add(add(f.a, f.v, c), f.u, s0), p1 = add(add(f.a, f.v, c), f.u, s1);
      out.push({ kind: "stringer", a: { ...p0, z: zc(s0) }, b: { ...p1, z: zc(s1) }, w: T, h: SH, size: "2x12" });
    }
  }
  for (const l of fs.landings) {
    const top = e + l.z, J = 7.25 * IN, z = top - 0.75 * IN - J / 2, hu = l.lu / 2, hv = l.lv / 2;
    const corner = (i: number, j: number, k = 0) => add(add(l.c, l.u, i * (hu - k)), l.v, j * (hv - k));
    out.push({ kind: "tread", a: { ...add(l.c, l.u, -hu), z: top - 0.375 * IN }, b: { ...add(l.c, l.u, hu), z: top - 0.375 * IN }, w: l.lv, h: 0.75 * IN, size: '3/4" PLYWOOD' });
    // marco perimetral y viguetas a 16" en la dirección de u
    for (const j of [-1, 1]) out.push({ kind: "stringer", a: { ...corner(-1, j, T / 2), z }, b: { ...corner(1, j, T / 2), z }, w: T, h: J, size: "2x8" });
    for (const i of [-1, 1]) out.push({ kind: "stringer", a: { ...corner(i, -1, T / 2), z }, b: { ...corner(i, 1, T / 2), z }, w: T, h: J, size: "2x8" });
    const nj = Math.floor((l.lv - T) / (16 * IN));
    for (let q = 1; q <= nj; q++) { const v = -hv + (q * l.lv) / (nj + 1); out.push({ kind: "stringer", a: { ...add(add(l.c, l.u, -hu + T), l.v, v), z }, b: { ...add(add(l.c, l.u, hu - T), l.v, v), z }, w: T, h: J, size: "2x8" }); }
    for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = corner(i, j, 1.75 * IN + T);
      out.push({ kind: "stringer", a: { ...p, z: e }, b: { ...p, z: z - J / 2 }, w: 3.5 * IN, h: 3.5 * IN, along: l.u, size: "4x4 POST" });
    }
  }
  return out;
}

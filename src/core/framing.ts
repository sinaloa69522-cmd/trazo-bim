// Estructura de madera (wood framing) en 3D a partir del modelo: cimentación, soleras, montantes, dinteles,
// viguetas, cabios, limatesas y cumbrera, con los tamaños de predimensionado de permit.ts (tablas del IRC).
import { dir, loc, roofGeom, type P3 } from "./geometry";
import type { Project, Roof, Wall } from "./model";
import { foundation } from "./foundation";
import { floorJoist, headerSize, isExterior, joistBays, rafterSize } from "./permit";
import { IN } from "./units";

export type MemberKind = "footing" | "foundation" | "pier" | "girder" | "slab" | "plate" | "stud" | "header" | "joist" | "rafter" | "ridge";

/**
 * Pieza recta entre los centros de sus extremos a y b. w es su ancho horizontal y h su canto
 * (vertical, o perpendicular a la pendiente). Las piezas verticales (montantes) llevan along: la dirección
 * del muro, a lo largo de la cual se mide w.
 */
export interface Member { kind: MemberKind; a: P3; b: P3; w: number; h: number; along?: { x: number; y: number }; size: string }

/** Color de cada tipo de pieza en el 3D y en su leyenda. */
export const MEMBER_COLOR: Record<MemberKind, string> = {
  footing: "#b3b0a8", foundation: "#a7a49c", pier: "#9d9a92", girder: "#8f6436", slab: "#c4c1b9",
  plate: "#c99b62", stud: "#e2c08f", header: "#a8763f", joist: "#d6ad74", rafter: "#d9b27c", ridge: "#9c6c3a",
};

const T = 1.5 * IN;
/** Canto real de una escuadría nominal ("2x8" → 7 1/4"). */
export function actualDepth(size: string) {
  if (/TJI/.test(size)) return 11.875 * IN;
  const n = Number(/2x(\d+)/.exec(size)?.[1] ?? 6);
  return (n <= 6 ? n - 0.5 : n - 0.75) * IN;
}
const nominal = (size: string) => /2x\d+/.exec(size)?.[0] ?? (/TJI/.test(size) ? "TJI" : "2x6");

/** Todas las piezas del proyecto. */
export function framing(p: Project): Member[] {
  // la cimentación (y el piso de madera si lo lleva) bajo la planta baja
  const out: Member[] = foundation(p);
  p.levels.forEach((lv, li) => {
    const e = lv.elev, above = p.levels[li + 1];
    for (const w of lv.walls) out.push(...wallFrame(w, lv.openings.filter((o) => o.wallId === w.id), e));
    // viguetas de piso (si hay planta encima) o de techo, apoyadas sobre la doble solera
    const H = lv.walls.length ? Math.max(...lv.walls.map((w) => w.height)) : 2.7;
    for (const bay of joistBays(lv, above ? "floor" : "ceiling")) {
      const d = actualDepth(bay.member), z = e + H + d / 2;
      for (const [a, b] of bay.segs) out.push({ kind: "joist", a: { ...a, z }, b: { ...b, z }, w: T, h: d, size: nominal(bay.member) });
    }
    for (const r of lv.roofs) out.push(...roofFrame(r, e));
  });
  return out;
}

/** Entramado de un muro: solera inferior, doble solera superior, montantes a 16" y huecos con dintel. */
function wallFrame(w: Wall, ops: { t: number; width: number; height: number; sill: number; kind: string }[], e: number): Member[] {
  const out: Member[] = [], { L, ux, uy } = dir(w), H = w.height, ext = isExterior(w);
  const D = Math.min(w.thick, ext ? 5.5 * IN : 3.5 * IN), size = ext ? "2x6" : "2x4", along = { x: ux, y: uy };
  const plate = (z: number) => out.push({ kind: "plate", a: { ...loc(w, 0, 0), z }, b: { ...loc(w, L, 0), z }, w: D, h: T, size });
  plate(e + T / 2); plate(e + H - T / 2); plate(e + H - 1.5 * T);
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
function roofFrame(r: Roof, e: number): Member[] {
  const out: Member[] = [], g = roofGeom(r);
  const xs = g.outline.map((q) => q.x), ys = g.outline.map((q) => q.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const alongX = x1 - x0 >= y1 - y0, U0 = alongX ? x0 : y0, U1 = alongX ? x1 : y1, V0 = alongX ? y0 : x0, V1 = alongX ? y1 : x1;
  const P = (u: number, v: number, z: number): P3 => (alongX ? { x: u, y: v, z } : { x: v, y: u, z });
  const short = V1 - V0, s = 24 * IN;
  if (r.kind === "flat") {
    const m = floorJoist(short), d = actualDepth(m), z = e + r.base - d / 2;
    for (let u = U0 + s / 2; u < U1; u += s) out.push({ kind: "rafter", a: P(u, V0, z), b: P(u, V1, z), w: T, h: d, size: nominal(m) });
    return out;
  }
  const tan = Math.tan((Math.max(1, Math.min(75, r.pitch)) * Math.PI) / 180), half = short / 2, vm = (V0 + V1) / 2;
  const m = rafterSize(half), d = actualDepth(/TRUSS/.test(m) ? "2x8" : m), z0 = e + r.base - r.overhang * tan;
  // eje de la pieza: medio canto por debajo del plano del faldón
  const drop = d / 2 / Math.cos(Math.atan(tan));
  const Z = (dv: number) => z0 + dv * tan - drop;
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
  // montantes del hastial, sobre la línea del muro, hasta la cara inferior de los cabios
  if (!hip) {
    const along = alongX ? { x: 0, y: 1 } : { x: 1, y: 0 }, o = r.overhang, zb = e + r.base;
    for (const u of [U0 + o, U1 - o]) for (let v = V0 + o + 16 * IN; v < V1 - o - 0.05; v += 16 * IN) {
      const top = Z(Math.min(v - V0, V1 - v)) - drop;
      if (top - zb > 0.05) out.push({ kind: "stud", a: P(u, v, zb), b: P(u, v, top), w: T, h: 3.5 * IN, along, size: "2x4" });
    }
  }
  // cumbrera dos escuadrías más alta que los cabios; limatesas iguales
  const rs = nominal(m).replace(/2x(\d+)/, (_, n) => `2x${Math.min(14, Number(n) + 2)}`), rd = actualDepth(rs);
  const zr = z0 + half * tan - rd / 2;
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

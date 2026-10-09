// Sistemas de piso y de techo: viguetas, vigas de borde (rim joists), bloqueos a media luz y subpiso,
// con las luces y escuadrías de joistBays (tablas del IRC).
import { dir, loc } from "./geometry";
import { outward } from "./finishes";
import type { Member } from "./framing";
import type { Level } from "./model";
import { isExterior, joistBays } from "./permit";
import { IN } from "./units";

const T = 1.5 * IN;
/** Subpiso: tablero OSB / contrachapado de 3/4" machihembrado. */
export const SUBFLOOR = 0.75 * IN;

/** Canto real de una escuadría nominal ("2x8" → 7 1/4", TJI → 11 7/8"). */
export function depthOf(size: string) {
  if (/TJI/.test(size)) return 11.875 * IN;
  const n = Number(/2x(\d+)/.exec(size)?.[1] ?? 6);
  return (n <= 6 ? n - 0.5 : n - 0.75) * IN;
}
const nominal = (size: string) => /2x\d+/.exec(size)?.[0] ?? (/TJI/.test(size) ? "TJI" : "2x6");

/** Canto de las viguetas de piso de un nivel: el de la habitación de más luz. */
export function floorJoistDepth(lv: Level) {
  const bays = joistBays(lv, "floor");
  return bays.length ? Math.max(...bays.map((b) => depthOf(b.member))) : depthOf("2x10");
}

/**
 * Piso de madera sobre los muros (o la cimentación) de un nivel: viguetas a 16" por habitación con su bloqueo
 * a media luz, viga de borde sobre los muros exteriores y subpiso. zb es la cara inferior de las viguetas;
 * d fija un canto común (el del piso más cargado) o, sin él, cada habitación usa el suyo.
 */
export function floorSystem(lv: Level, zb: number, d?: number): Member[] {
  const out: Member[] = [], bays = joistBays(lv, "floor");
  if (!bays.length) return out;
  const D = d ?? Math.max(...bays.map((b) => depthOf(b.member))), z = zb + D / 2;
  for (const bay of bays) {
    const size = nominal(bay.member);
    for (const [a, b] of bay.segs) out.push({ kind: "floorJoist", a: { ...a, z }, b: { ...b, z }, w: T, h: D, size });
    out.push(...blocking(bay.segs, z, D, size));
    // subpiso sobre la crujía, con la huella de las viguetas
    const xs = bay.segs.flatMap(([a, b]) => [a.x, b.x]), ys = bay.segs.flatMap(([a, b]) => [a.y, b.y]);
    if (xs.length) {
      const x0 = Math.min(...xs) - 8 * IN, x1 = Math.max(...xs) + 8 * IN, y0 = Math.min(...ys) - 8 * IN, y1 = Math.max(...ys) + 8 * IN;
      const zs = zb + D + SUBFLOOR / 2;
      out.push({ kind: "subfloor", a: { x: x0, y: (y0 + y1) / 2, z: zs }, b: { x: x1, y: (y0 + y1) / 2, z: zs }, w: y1 - y0, h: SUBFLOOR, size: '3/4" T&G OSB' });
    }
  }
  // viga de borde en la cara exterior de los muros de fachada
  for (const w of lv.walls.filter(isExterior)) {
    const { L } = dir(w), off = (Math.min(w.thick, 5.5 * IN) / 2 - T / 2) * outward(lv.walls, w);
    out.push({ kind: "rim", a: { ...loc(w, 0, off), z }, b: { ...loc(w, L, off), z }, w: T, h: D, size: `RIM ${nominal(bays[0].member)}` });
  }
  return out;
}

/** Viguetas de techo a 16" por habitación (sin planta encima), apoyadas sobre la doble solera, con su bloqueo. */
export function ceilingSystem(lv: Level, zb: number): Member[] {
  const out: Member[] = [];
  for (const bay of joistBays(lv, "ceiling")) {
    const d = depthOf(bay.member), z = zb + d / 2, size = nominal(bay.member);
    for (const [a, b] of bay.segs) out.push({ kind: "ceilingJoist", a: { ...a, z }, b: { ...b, z }, w: T, h: d, size });
    out.push(...blocking(bay.segs, z, d, size));
  }
  return out;
}

/** Bloqueo macizo a media luz entre viguetas consecutivas (luces de más de 8', IRC R502.7). */
function blocking(segs: [{ x: number; y: number }, { x: number; y: number }][], z: number, d: number, size: string): Member[] {
  if (segs.length < 2) return [];
  const along = Math.abs(segs[0][1].x - segs[0][0].x) < 1e-6 ? "y" : "x", across = along === "y" ? "x" : "y";
  const lo = Math.min(...segs.flatMap((s) => [s[0][along], s[1][along]])), hi = Math.max(...segs.flatMap((s) => [s[0][along], s[1][along]]));
  if (hi - lo < 8 * 12 * IN) return [];
  const m = (lo + hi) / 2, out: Member[] = [];
  const covers = (s: (typeof segs)[number]) => Math.min(s[0][along], s[1][along]) <= m && Math.max(s[0][along], s[1][along]) >= m;
  const hit = segs.filter(covers).map((s) => s[0][across]).sort((a, b) => a - b);
  for (let i = 0; i + 1 < hit.length; i++) {
    const c0 = hit[i] + T / 2, c1 = hit[i + 1] - T / 2;
    if (c1 - c0 < 0.05 || c1 - c0 > 0.5) continue;
    const P = (c: number) => (along === "y" ? { x: c, y: m, z } : { x: m, y: c, z });
    out.push({ kind: "blocking", a: P(c0), b: P(c1), w: T, h: d, size });
  }
  return out;
}

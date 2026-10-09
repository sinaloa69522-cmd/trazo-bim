// Sistemas de piso y de techo: viguetas, vigas de borde (rim joists), bloqueos a media luz y subpiso,
// con las luces y escuadrías de joistBays (tablas del IRC).
import { dir, distSeg, loc } from "./geometry";
import { outward } from "./finishes";
import type { Member } from "./framing";
import type { Level, Wall } from "./model";
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

/** Canto mínimo de los ceiling joists: 2x10, o lo que pida la tabla si es mayor. */
const CEILING_MIN = "2x10";

/**
 * Viguetas de techo a 16" por habitación (sin planta encima) con su bloqueo, apoyadas sobre la doble solera
 * de los muros en los que acaban, y viga de borde (rim joist) sobre los muros exteriores paralelos a ellas.
 */
export function ceilingSystem(lv: Level, e: number, wallH: (w: Wall) => number = (w) => w.height): Member[] {
  const out: Member[] = [], bays = joistBays(lv, "ceiling");
  const Hmax = lv.walls.length ? Math.max(...lv.walls.map(wallH)) : 2.7;
  // muro sobre el que apoya cada extremo: el más cercano, a menos de medio espesor más 10 cm
  const seatAt = (q: { x: number; y: number }) => {
    let best: Wall | null = null, bd = Infinity;
    for (const w of lv.walls) { const { d } = distSeg(q.x, q.y, w.x1, w.y1, w.x2, w.y2); if (d < w.thick / 2 + 0.1 && d < bd) { bd = d; best = w; } }
    return best ? wallH(best) : null;
  };
  let angle = 0, nAngle = 0, D = depthOf(CEILING_MIN);
  for (const bay of bays) {
    const size = depthOf(bay.member) > depthOf(CEILING_MIN) ? nominal(bay.member) : CEILING_MIN, d = depthOf(size);
    D = Math.max(D, d);
    const hs = bay.segs.flatMap(([a, b]) => [seatAt(a), seatAt(b)]).filter((h): h is number => h !== null);
    const z = e + (hs.length ? Math.max(...hs) : Hmax) + d / 2;
    for (const [a, b] of bay.segs) out.push({ kind: "ceilingJoist", a: { ...a, z }, b: { ...b, z }, w: T, h: d, size });
    out.push(...blocking(bay.segs, z, d, size));
    if (bay.segs.length > nAngle) { nAngle = bay.segs.length; angle = bay.angle; }
  }
  // rim joists sobre los muros de fachada paralelos a las viguetas (en los otros apoyan sus testas y los cabios)
  if (bays.length) for (const w of lv.walls.filter(isExterior)) {
    const { L, ux } = dir(w), parallel = angle === 90 ? Math.abs(ux) < 0.5 : Math.abs(ux) > 0.5;
    if (!parallel) continue;
    const off = (Math.min(w.thick, 5.5 * IN) / 2 - T / 2) * outward(lv.walls, w), z = e + wallH(w) + D / 2;
    out.push({ kind: "rim", a: { ...loc(w, 0, off), z }, b: { ...loc(w, L, off), z }, w: T, h: D, size: `RIM ${nominalOf(D)}` });
  }
  return out;
}
const nominalOf = (d: number) => ["2x4", "2x6", "2x8", "2x10", "2x12"].find((n) => Math.abs(depthOf(n) - d) < 1e-6) ?? "2x10";

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

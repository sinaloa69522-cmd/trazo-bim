/**
 * Juego de planos para permiso de construcción en EE.UU.: geometría que se genera a partir del modelo
 * para las láminas estructurales (cimentación, entramados), el site plan y el HVAC.
 * Las medidas son predimensionados de vivienda unifamiliar según las tablas del IRC; el proyecto
 * lo tiene que revisar y sellar un profesional con licencia.
 */
import { bounds, dir, loc, polygonArea, roofGeom, type Pt } from "./geometry";
import { hatchSegments, maskLoops, type PatLine } from "./hatch";
import type { Level, Model, Project, Wall } from "./model";
import { computeRooms, RC, type RoomGrid } from "./rooms";
import { FT, IN } from "./units";

export type Seg2 = [Pt, Pt];

/** Caja de los muros (por su cara exterior), sin los márgenes de bounds(). */
export function wallBox(m: Model) {
  if (!m.walls.length) { const b = bounds(m); return { x0: b.x0 + 1.5, y0: b.y0 + 1.5, x1: b.x1 - 1.5, y1: b.y1 - 1.5 }; }
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const w of m.walls) for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]]) {
    const h = w.thick / 2;
    b.x0 = Math.min(b.x0, x - h); b.y0 = Math.min(b.y0, y - h); b.x1 = Math.max(b.x1, x + h); b.y1 = Math.max(b.y1, y + h);
  }
  return b;
}

/** Muro exterior o de carga: los de 2x6 y más gruesos. */
export const isExterior = (w: Wall) => w.thick >= 0.15;

// ---------- cimentación ----------

export interface Footing { mark: "F1" | "F2"; wall: Wall; poly: Pt[] }
/** Zapatas corridas: F1 bajo muros exteriores (16" × 8"), F2 bajo muros interiores (12" × 8"). */
export const FOOTING_TYPES = { F1: { width: 16 * IN, depth: 8 * IN }, F2: { width: 12 * IN, depth: 8 * IN } };

export function footings(m: Model): Footing[] {
  return m.walls.map((w) => {
    const mark = isExterior(w) ? "F1" : "F2", h = FOOTING_TYPES[mark].width / 2, { L } = dir(w);
    return { mark, wall: w, poly: [loc(w, -h, -h), loc(w, L + h, -h), loc(w, L + h, h), loc(w, -h, h)] } as Footing;
  });
}

/** Pernos de anclaje de 1/2" a 6'-0" como máximo y a 12" de cada extremo (IRC R403.1.6). */
export function anchorBolts(m: Model): Pt[] {
  const out: Pt[] = [];
  for (const w of m.walls.filter(isExterior)) {
    const { L } = dir(w), a = 12 * IN, b = L - 12 * IN;
    if (b <= a) { out.push(loc(w, L / 2, 0)); continue; }
    const n = Math.max(1, Math.ceil((b - a) / (6 * FT)));
    for (let i = 0; i <= n; i++) out.push(loc(w, a + ((b - a) * i) / n, 0));
  }
  return out;
}

// ---------- predimensionado (tablas del IRC, pino/abeto #2) ----------

/** Vigueta de piso a 16" (R502.3.1, 40 psf de uso, L/360). */
export function floorJoist(span: number) {
  const t: [string, number][] = [["2x6", 10.75], ["2x8", 14.17], ["2x10", 18], ["2x12", 20.9]];
  const f = t.find(([, s]) => span <= s * FT);
  return f ? `${f[0]} @ 16" O.C.` : `11-7/8" TJI @ 16" O.C.`;
}
/** Vigueta de techo sin almacenamiento a 16" (R802.4.1). */
export function ceilingJoist(span: number) {
  const t: [string, number][] = [["2x4", 12.67], ["2x6", 19.9], ["2x8", 26.2]];
  const f = t.find(([, s]) => span <= s * FT);
  return f ? `${f[0]} @ 16" O.C.` : `2x10 @ 16" O.C.`;
}
/** Cabio a 24" según su proyección horizontal (R802.5.1, 20 psf de nieve). */
export function rafterSize(run: number) {
  const t: [string, number][] = [["2x6", 12.25], ["2x8", 15.83], ["2x10", 20.25], ["2x12", 24.58]];
  const f = t.find(([, s]) => run <= s * FT);
  return f ? `${f[0]} @ 24" O.C.` : `ENGINEERED TRUSSES @ 24" O.C.`;
}
/** Dintel de muro de carga exterior según la luz del hueco (R602.7, una planta encima como máximo). */
export function headerSize(width: number) {
  const t: [string, number][] = [["(2) 2x6", 3], ["(2) 2x8", 4.5], ["(2) 2x10", 6], ["(2) 2x12", 8]];
  const f = t.find(([, s]) => width <= s * FT + 1e-6);
  return f ? f[0] : `3-1/2" x 11-7/8" LVL`;
}

// ---------- entramado de piso / techo ----------

export interface Bay { name: string; segs: Seg2[]; span: number; member: string; at: Pt; angle: number }

/** Viguetas a 16" en cada habitación cerrada, en la dirección corta, recortadas por su contorno. */
export function joistBays(m: Model, kind: "floor" | "ceiling", g: RoomGrid | null = computeRooms(m)): Bay[] {
  const out: Bay[] = [];
  if (!g) return out;
  for (const r of m.rooms) {
    const c = g.rooms.get(r.id);
    if (!c?.ok || !c.mask) continue;
    const loops = maskLoops(c.mask, g.nx, g.ny, g.x0, g.y0, RC);
    if (!loops.length) continue;
    const xs = loops.flat().map((p) => p.x), ys = loops.flat().map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    // las viguetas van de muro a muro por la luz corta
    const alongY = x1 - x0 >= y1 - y0, span = alongY ? y1 - y0 : x1 - x0, s = 16 * IN;
    const line: PatLine = alongY
      ? { angle: 90, base: { x: x0 + s / 2, y: 0 }, offset: { x: s, y: 0 }, dashes: [] }
      : { angle: 0, base: { x: 0, y: y0 + s / 2 }, offset: { x: 0, y: s }, dashes: [] };
    const segs = hatchSegments(loops, [line], 4000).segs as Seg2[];
    out.push({ name: r.name, segs, span, member: kind === "floor" ? floorJoist(span) : ceilingJoist(span), at: { x: c.cx, y: c.cy }, angle: alongY ? 90 : 0 });
  }
  return out;
}

// ---------- entramado de muros ----------

export interface Header { mark: string; size: string; width: number; a: Pt; b: Pt; at: Pt }

/** Montantes a 16" O.C. como marcas a través del muro, sin pasar por los huecos. */
export function studs(m: Model): Seg2[] {
  const out: Seg2[] = [];
  for (const w of m.walls) {
    const { L } = dir(w), h = w.thick / 2, ops = m.openings.filter((o) => o.wallId === w.id).map((o) => [o.t * L - o.width / 2, o.t * L + o.width / 2]);
    for (let s = 0; s <= L + 1e-6; s += 16 * IN) {
      if (ops.some(([a, b]) => s > a - 1e-6 && s < b + 1e-6)) continue;
      out.push([loc(w, s, -h), loc(w, s, h)]);
    }
    // montantes dobles en los extremos y a cada lado de los huecos (king + jack)
    for (const [a, b] of ops) for (const s of [a - 1.5 * IN, b + 1.5 * IN]) out.push([loc(w, s, -h), loc(w, s, h)]);
    out.push([loc(w, L, -h), loc(w, L, h)]);
  }
  return out;
}

/** Dintel de cada hueco, con marcas H1, H2… por tamaño (de menor a mayor luz). */
export function headers(m: Model): { list: Header[]; types: { mark: string; size: string; maxWidth: number; count: number }[] } {
  const raw: Omit<Header, "mark">[] = [];
  for (const o of m.openings) {
    const w = m.walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    const { L } = dir(w), c = o.t * L, size = isExterior(w) ? headerSize(o.width) : "(2) 2x6 FLAT";
    raw.push({ size, width: o.width, a: loc(w, c - o.width / 2, 0), b: loc(w, c + o.width / 2, 0), at: loc(w, c, w.thick / 2 + 0.35) });
  }
  const sizes = [...new Set(raw.sort((p, q) => p.width - q.width).map((h) => h.size))];
  const types = sizes.map((size, i) => {
    const hs = raw.filter((h) => h.size === size);
    return { mark: `H${i + 1}`, size, maxWidth: Math.max(...hs.map((h) => h.width)), count: hs.length };
  });
  return { list: raw.map((h) => ({ ...h, mark: types.find((t) => t.size === h.size)!.mark })), types };
}

// ---------- entramado de cubierta ----------

export interface RoofFrame { outline: Pt[]; ridges: Seg2[]; rafters: Seg2[]; member: string; ridge: string; run: number; at: Pt; flat: boolean }

/** Cabios a 24" perpendiculares a la cumbrera (o viguetas en la dirección corta si es plana). */
export function roofFraming(m: Model): RoofFrame[] {
  return m.roofs.map((r) => {
    const g = roofGeom(r), xs = g.outline.map((p) => p.x), ys = g.outline.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const alongX = x1 - x0 >= y1 - y0, s = 24 * IN, flat = r.kind === "flat";
    // la cumbrera va en la dirección larga; los cabios cruzan la corta
    const line: PatLine = alongX
      ? { angle: 90, base: { x: x0 + s / 2, y: 0 }, offset: { x: s, y: 0 }, dashes: [] }
      : { angle: 0, base: { x: 0, y: y0 + s / 2 }, offset: { x: 0, y: s }, dashes: [] };
    const rafters = hatchSegments([g.outline], [line], 4000).segs as Seg2[];
    const short = alongX ? y1 - y0 : x1 - x0, run = flat ? short : short / 2;
    return {
      outline: g.outline, ridges: g.ridges as Seg2[], rafters, flat, run,
      member: flat ? floorJoist(run).replace("@ 16\"", "@ 24\"") : rafterSize(run),
      ridge: flat ? "" : `${rafterSize(run).split(" ")[0].replace(/2x(\d+)/, (_, d) => `2x${Math.min(14, Number(d) + 2)}`)} RIDGE BOARD`,
      at: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 },
    };
  });
}

// ---------- site plan ----------

export interface Site { lot: Pt[]; setback: Pt[]; footprint: Pt[]; drive: Pt[]; w: number; d: number; sb: { front: number; rear: number; side: number } }

/**
 * Parcela supuesta alrededor de la casa: retranqueos habituales de zona residencial
 * (frente 25', fondo 20', lados 5') redondeados a 5'. Hay que verificarla con el levantamiento.
 */
export function site(lv: Model): Site {
  const b = wallBox(lv), sb = { front: 25 * FT, rear: 20 * FT, side: 5 * FT };
  const rnd = (v: number) => Math.ceil(v / (5 * FT)) * 5 * FT;
  const bw = b.x1 - b.x0, bd = b.y1 - b.y0;
  const w = rnd(bw + 2 * sb.side + 10 * FT), d = rnd(bd + sb.front + sb.rear);
  // el frente (calle) queda abajo, al sur
  const lx0 = b.x0 - (w - bw) / 2, ly1 = b.y1 + sb.front, ly0 = ly1 - d;
  const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const dw = 12 * FT, dx = Math.min(b.x1, lx0 + w - sb.side) - dw;
  return {
    lot: rect(lx0, ly0, lx0 + w, ly1), setback: rect(lx0 + sb.side, ly0 + sb.rear, lx0 + w - sb.side, ly1 - sb.front),
    footprint: rect(b.x0, b.y0, b.x1, b.y1), drive: rect(dx, b.y1, dx + dw, ly1), w, d, sb,
  };
}

// ---------- HVAC ----------

export interface Register { room: string; at: Pt; cfm: number; duct: number; size: string }
export interface Hvac { ahu: Pt; cu: Pt; tons: number; supplies: Register[]; returnAt: Pt; exhausts: { room: string; at: Pt }[]; ducts: Pt[][] }

const isWet = (n: string) => /ba[ñn]o|bath|aseo|wc|lavander|laundry|toilet/i.test(n);

/** Rejillas de impulsión por habitación (1 CFM por sq ft), retorno, unidad interior y condensadora. */
export function hvac(m: Model, g: RoomGrid | null = computeRooms(m)): Hvac | null {
  if (!g) return null;
  const rooms = m.rooms.map((r) => ({ r, c: g.rooms.get(r.id) })).filter((x) => x.c?.ok) as { r: Model["rooms"][number]; c: NonNullable<ReturnType<RoomGrid["rooms"]["get"]>> }[];
  if (!rooms.length) return null;
  const b = wallBox(m), sqft = (a: number) => a / (FT * FT);
  const total = rooms.reduce((s, x) => s + sqft(x.c.area), 0);
  // la unidad interior en el espacio más pequeño (armario o cuarto de instalaciones)
  const dry = rooms.filter((x) => !isWet(x.r.name)), pool = dry.length > 1 ? dry : rooms;
  const small = pool.reduce((a, x) => (x.c.area < a.c.area ? x : a)), big = rooms.reduce((a, x) => (x.c.area > a.c.area ? x : a));
  const ahu = { x: small.c.cx, y: small.c.cy };
  const sides = [{ d: ahu.x - b.x0, p: { x: b.x0 - 3 * FT, y: ahu.y } }, { d: b.x1 - ahu.x, p: { x: b.x1 + 3 * FT, y: ahu.y } }, { d: ahu.y - b.y0, p: { x: ahu.x, y: b.y0 - 3 * FT } }, { d: b.y1 - ahu.y, p: { x: ahu.x, y: b.y1 + 3 * FT } }];
  const cu = sides.reduce((a, s) => (s.d < a.d ? s : a)).p;
  const duct = (cfm: number) => (cfm <= 60 ? 5 : cfm <= 100 ? 6 : cfm <= 150 ? 7 : cfm <= 220 ? 8 : 10);
  const supplies: Register[] = [];
  for (const { r, c } of rooms) {
    if (r === small.r) continue;
    const cfm = Math.max(50, Math.round(sqft(c.area) / 10) * 10), n = cfm > 250 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const at = { x: c.cx + (n > 1 ? (i ? 0.6 : -0.6) : 0), y: c.cy - 0.6 };
      const each = Math.round(cfm / n), d = duct(each);
      supplies.push({ room: r.name, at, cfm: each, duct: d, size: each <= 100 ? `4"x10"` : `6"x12"` });
    }
  }
  const returnAt = { x: big.c.cx + 0.9, y: big.c.cy + 0.5 };
  const ducts = supplies.map((s) => [ahu, { x: s.at.x, y: ahu.y }, s.at]);
  ducts.push([ahu, { x: returnAt.x, y: ahu.y }, returnAt]);
  return {
    ahu, cu, tons: Math.max(1.5, Math.ceil(total / 600 * 2) / 2), supplies, returnAt, ducts,
    exhausts: rooms.filter(({ r }) => isWet(r.name)).map(({ r, c }) => ({ room: r.name, at: { x: c.cx + 0.5, y: c.cy + 0.5 } })),
  };
}

// ---------- datos del proyecto ----------

/** Superficie habitable (climatizada) por nivel y huella, en m². */
export function projectAreas(p: Project) {
  const levels = p.levels.map((lv: Level) => {
    const g = computeRooms(lv);
    const living = lv.rooms.reduce((s, r) => s + (g?.rooms.get(r.id)?.ok ? g.rooms.get(r.id)!.area : 0), 0);
    const b = lv.walls.length ? wallBox(lv) : null;
    return { name: lv.name, living, gross: b ? polygonArea([{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }]) : 0 };
  });
  return { levels, living: levels.reduce((s, l) => s + l.living, 0), footprint: levels[0]?.gross ?? 0 };
}

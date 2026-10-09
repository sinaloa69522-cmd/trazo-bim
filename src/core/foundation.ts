// Tipos de cimentación de la vivienda: losa sobre terreno, losa monolítica, losa sobre muro de block,
// crawl space, sótano y pilares con vigas. Genera sus piezas en 3D (concreto, block y el piso de madera
// cuando lo hay) y los datos del plano de cimentación S-101.
import { dir, loc } from "./geometry";
import type { Member } from "./framing";
import { floorSystem, SUBFLOOR } from "./joists";
import type { Level, Project, Wall } from "./model";
import { floorJoist, isExterior, joistBays, wallBox } from "./permit";
import { FT, IN } from "./units";

export type FoundationKind = "slab" | "monolithic" | "stemwall" | "crawl" | "basement" | "pier";

export interface FoundationType {
  id: FoundationKind;
  name: string;
  en: string;
  /** Piso de madera sobre la cimentación (en vez de losa de concreto) */
  framedFloor: boolean;
  /** Zapatas: exterior e interior, ancho × peralte */
  ext: { w: number; d: number; bars: string };
  int?: { w: number; d: number; bars: string };
  /** Notas del plano de cimentación (inglés, juego de EE.UU.) */
  notes: string[];
}

const COMMON_BOLTS = "1/2\" DIA. ANCHOR BOLTS @ 6'-0\" O.C. MAX, 12\" MAX FROM PLATE ENDS, 2 MIN PER PLATE SECTION (IRC R403.1.6).";
const FROST = "BOTTOM OF FOOTING 12\" MIN BELOW UNDISTURBED GRADE OR BELOW LOCAL FROST DEPTH, WHICHEVER IS DEEPER.";

export const FOUNDATIONS: FoundationType[] = [
  {
    id: "slab", name: "Losa sobre terreno con zapatas", en: "Slab on grade with continuous footings", framedFloor: false,
    ext: { w: 16 * IN, d: 8 * IN, bars: "(2) #4 CONT." }, int: { w: 12 * IN, d: 8 * IN, bars: "(1) #4 CONT." },
    notes: [
      "F1: 16\" WIDE x 8\" DEEP CONTINUOUS FOOTING WITH (2) #4 BARS CONT. AT EXTERIOR WALLS.",
      "F2: 12\" WIDE x 8\" DEEP THICKENED SLAB WITH (1) #4 BAR CONT. AT INTERIOR BEARING WALLS.",
      FROST,
      "4\" CONCRETE SLAB OVER 6 MIL VAPOR RETARDER OVER 4\" GRAVEL. SAW-CUT CONTROL JOINTS AT 12'-0\" O.C. MAX.",
      COMMON_BOLTS,
      "SLAB EDGE INSULATION PER ENERGY NOTES.",
    ],
  },
  {
    id: "monolithic", name: "Losa monolítica (borde engrosado)", en: "Monolithic slab with turned-down edge", framedFloor: false,
    ext: { w: 12 * IN, d: 18 * IN, bars: "(2) #4 TOP & BOT." }, int: { w: 12 * IN, d: 8 * IN, bars: "(1) #4 CONT." },
    notes: [
      "MONOLITHIC SLAB: 4\" SLAB AND 12\" WIDE x 18\" DEEP TURNED-DOWN EDGE POURED IN ONE PLACEMENT.",
      "EDGE: (2) #4 TOP AND (2) #4 BOTTOM CONT. INTERIOR BEARING: 12\" x 8\" THICKENED SLAB WITH (1) #4.",
      "FOR USE IN FROST-FREE AREAS OR WITH FROST-PROTECTED SHALLOW FOUNDATION INSULATION PER IRC R403.3.",
      "6 MIL VAPOR RETARDER OVER 4\" COMPACTED GRAVEL. CONTROL JOINTS AT 12'-0\" O.C. MAX.",
      COMMON_BOLTS,
    ],
  },
  {
    id: "stemwall", name: "Losa sobre muro de block (stem wall)", en: "Stem wall foundation with slab", framedFloor: false,
    ext: { w: 16 * IN, d: 8 * IN, bars: "(2) #4 CONT." }, int: { w: 12 * IN, d: 8 * IN, bars: "(1) #4 CONT." },
    notes: [
      "8\" CMU STEM WALL ON 16\" x 8\" CONTINUOUS FOOTING WITH (2) #4 CONT. VERTICAL #4 @ 48\" O.C. GROUTED SOLID.",
      "COMPACTED FILL INSIDE STEM WALL IN 8\" LIFTS TO 95% PROCTOR, THEN 4\" SLAB OVER VAPOR RETARDER.",
      "TOP OF STEM WALL 8\" MIN ABOVE FINISHED GRADE (IRC R404.1.6).",
      FROST,
      COMMON_BOLTS,
    ],
  },
  {
    id: "crawl", name: "Crawl space (muro de block y piso de madera)", en: "Crawl space foundation", framedFloor: true,
    ext: { w: 16 * IN, d: 8 * IN, bars: "(2) #4 CONT." }, int: { w: 24 * IN, d: 12 * IN, bars: "(3) #4 E.W." },
    notes: [
      "8\" CMU FOUNDATION WALL ON 16\" x 8\" CONTINUOUS FOOTING WITH (2) #4 CONT. GROUT CELLS SOLID AT ANCHOR BOLTS.",
      "INTERIOR: 16\" x 16\" CMU PIERS ON 24\" x 24\" x 12\" FOOTINGS @ 6'-0\" O.C. MAX UNDER GIRDERS.",
      "18\" MIN CLEARANCE FROM GROUND TO BOTTOM OF JOISTS, 12\" TO GIRDERS (IRC R317.1).",
      "VENTILATION: 1 SQ FT NET PER 150 SQ FT OF CRAWL SPACE, ONE VENT WITHIN 3'-0\" OF EACH CORNER, OR UNVENTED PER R408.3.",
      "6 MIL POLY GROUND COVER LAPPED 6\" AND TURNED UP WALLS. 18\" x 24\" MIN ACCESS OPENING (R408.4).",
      "P.T. 2x SILL PLATE WITH SILL SEALER. " + COMMON_BOLTS,
    ],
  },
  {
    id: "basement", name: "Sótano (muros de concreto)", en: "Full basement", framedFloor: true,
    ext: { w: 20 * IN, d: 10 * IN, bars: "(3) #4 CONT." }, int: { w: 24 * IN, d: 12 * IN, bars: "(3) #4 E.W." },
    notes: [
      "8\" POURED CONCRETE BASEMENT WALL, #4 VERT. @ 24\" O.C. AND #4 HORIZ. @ 24\" O.C., ON 20\" x 10\" FOOTING WITH (3) #4 CONT.",
      "WALLS DESIGNED PER IRC TABLE R404.1.2; BACKFILL ONLY AFTER FLOOR FRAMING IS IN PLACE.",
      "DAMPPROOF EXTERIOR OF WALL BELOW GRADE AND PROVIDE PERIMETER FOOTING DRAIN TO DAYLIGHT OR SUMP (R405, R406).",
      "4\" BASEMENT SLAB OVER 6 MIL VAPOR RETARDER OVER 4\" GRAVEL.",
      "INTERIOR: STEEL PIPE COLUMNS ON 24\" x 24\" x 12\" PAD FOOTINGS UNDER GIRDERS @ 8'-0\" O.C. MAX.",
      "EMERGENCY ESCAPE OPENING OR WINDOW WELL REQUIRED IF BASEMENT HAS HABITABLE SPACE (R310). " + COMMON_BOLTS,
    ],
  },
  {
    id: "pier", name: "Pilares y vigas (pier & beam)", en: "Pier and beam foundation", framedFloor: true,
    ext: { w: 24 * IN, d: 12 * IN, bars: "(3) #4 E.W." },
    notes: [
      "12\" x 12\" CONCRETE PIERS ON 24\" x 24\" x 12\" FOOTINGS WITH (3) #4 EACH WAY @ 6'-0\" O.C. MAX.",
      "(3) 2x10 P.T. GIRDERS ON PIERS WITH GALVANIZED POST BASES / STRAPS.",
      "18\" MIN CLEARANCE FROM GROUND TO BOTTOM OF JOISTS (IRC R317.1).",
      "SKIRTING WITH VENTS BETWEEN PIERS AT PERIMETER. 18\" x 24\" MIN ACCESS.",
      FROST,
    ],
  },
];

export function foundationType(p: Pick<Project, "foundation">): FoundationType {
  return FOUNDATIONS.find((f) => f.id === p.foundation) ?? FOUNDATIONS[0];
}

/** Profundidad del piso de madera bajo la cota de la planta baja: vigueta más grande + solera. */
export function floorDepth(lv: Level) {
  const spans = joistBays(lv, "floor").map((b) => b.span);
  const m = floorJoist(spans.length ? Math.max(...spans) : 12 * FT), n = Number(/2x(\d+)/.exec(m)?.[1] ?? 10);
  return { member: m, d: /TJI/.test(m) ? 11.875 * IN : (n - 0.75) * IN };
}

const T = 1.5 * IN;

/** Cota del terreno junto a la casa: bajo la losa, o dejando ver el block del crawl space y los pilares. */
export function gradeLevel(p: Project) {
  const lv = p.levels[0], ft = foundationType(p);
  if (!lv || !ft.framedFloor) return (lv?.elev ?? 0) - 0.27;
  const top = lv.elev - floorDepth(lv).d - SUBFLOOR - T;
  return top - (ft.id === "pier" ? 24 : ft.id === "crawl" ? 16 : 8) * IN;
}
const BASEMENT_H = 8 * FT;

/**
 * Piezas de la cimentación bajo la planta baja: zapatas, muros, pilares, vigas y, si el piso es de madera,
 * solera de asiento, viga de borde y viguetas del piso.
 */
export function foundation(p: Project): Member[] {
  const lv = p.levels[0];
  if (!lv) return [];
  const ft = foundationType(p), e = lv.elev, out: Member[] = [];
  const along = (w: Wall, s0: number, s1: number, z: number, wd: number, h: number, kind: Member["kind"], size: string) =>
    out.push({ kind, a: { ...loc(w, s0, 0), z }, b: { ...loc(w, s1, 0), z }, w: wd, h, size });
  const fl = ft.framedFloor ? floorDepth(lv) : null;
  // cara superior del muro de cimentación: bajo el piso de madera, o a la cota de la losa
  const top = e - (fl ? fl.d + SUBFLOOR + T : 0);
  const exts = lv.walls.filter(isExterior), ints = lv.walls.filter((w) => !isExterior(w));
  const placed: { x: number; y: number }[] = [];
  const onWall = (x: Wall, c: { x: number; y: number }) => {
    const { L, ux, uy } = dir(x), t = (c.x - x.x1) * ux + (c.y - x.y1) * uy;
    return t > -x.thick && t < L + x.thick && Math.abs((c.x - x.x1) * uy - (c.y - x.y1) * ux) < x.thick;
  };
  /** Pilares a lo largo de un muro, con su zapata aislada; devuelve las posiciones. */
  const piers = (w: Wall, size: number, zTop: number, zFoot: number, kind: "pier" | "column" = "pier") => {
    const { L } = dir(w), n = Math.max(1, Math.ceil(L / (6 * FT)));
    for (let i = 0; i <= n; i++) {
      const s = (L * i) / n, c = loc(w, s, 0), pad = ft.int ?? ft.ext;
      // un solo pilar en cada encuentro, y ninguno donde ya apoya el muro de cimentación
      if (placed.some((q) => Math.hypot(q.x - c.x, q.y - c.y) < 0.45)) continue;
      if (ft.id !== "pier" && exts.some((x) => onWall(x, c))) continue;
      placed.push(c);
      out.push({ kind: "footing", a: { ...loc(w, s - pad.w / 2, 0), z: zFoot - pad.d / 2 }, b: { ...loc(w, s + pad.w / 2, 0), z: zFoot - pad.d / 2 }, w: pad.w, h: pad.d, size: "PAD" });
      out.push({ kind: kind === "column" ? "girder" : "pier", a: { ...c, z: zFoot }, b: { ...c, z: zTop }, w: kind === "column" ? 3.5 * IN : size, h: kind === "column" ? 3.5 * IN : size, along: { x: dir(w).ux, y: dir(w).uy }, size: kind === "column" ? "3\" STEEL COL." : "PIER" });
    }
  };

  if (ft.id === "slab" || ft.id === "monolithic" || ft.id === "stemwall") {
    for (const w of lv.walls) {
      const ex = isExterior(w), f = ex ? ft.ext : ft.int!, { L } = dir(w);
      if (ft.id === "stemwall" && ex) {
        const zf = e - 30 * IN;
        along(w, -f.w / 2, L + f.w / 2, zf - f.d / 2, f.w, f.d, "footing", "F1");
        along(w, -4 * IN, L + 4 * IN, (zf + e) / 2, 7.625 * IN, e - zf, "foundation", "8\" CMU");
      } else {
        // zapata corrida o borde engrosado, bajo la losa
        along(w, -f.w / 2, L + f.w / 2, e - (ft.id === "monolithic" && ex ? f.d / 2 : 4 * IN + f.d / 2), f.w, f.d, "footing", ex ? "F1" : "F2");
      }
    }
    return out;
  }

  if (ft.id === "pier") {
    const gd = 9.25 * IN;
    for (const w of lv.walls) {
      piers(w, 12 * IN, top - gd, top - 0.75 - gd);
      const { L } = dir(w);
      along(w, -0.05, L + 0.05, top - gd / 2, 4.5 * IN, gd, "girder", "(3) 2x10");
    }
  } else {
    // muro perimetral de block (crawl space) o de concreto (sótano) con su zapata corrida
    const bottom = ft.id === "basement" ? top - BASEMENT_H : Math.min(top - 24 * IN, e - 30 * IN);
    for (const w of exts) {
      const { L } = dir(w), f = ft.ext, wt = ft.id === "basement" ? 8 * IN : 7.625 * IN;
      along(w, -f.w / 2, L + f.w / 2, bottom - f.d / 2, f.w, f.d, "footing", "F1");
      along(w, -wt / 2, L + wt / 2, (bottom + top) / 2, wt, top - bottom, "foundation", ft.id === "basement" ? "8\" CONC." : "8\" CMU");
    }
    // bajo los muros interiores: pilares de block (crawl) o columnas de acero (sótano) con viga
    for (const w of ints) {
      const gd = 9.25 * IN, { L } = dir(w);
      piers(w, 16 * IN, top - gd, bottom, ft.id === "basement" ? "column" : "pier");
      along(w, 0, L, top - gd / 2, 4.5 * IN, gd, "girder", "(3) 2x10");
    }
    if (ft.id === "basement") {
      // losa del sótano en todo el contorno de los muros
      const b = wallBox(lv), h = 4 * IN;
      out.push({ kind: "slab", a: { x: b.x0, y: (b.y0 + b.y1) / 2, z: bottom + h / 2 }, b: { x: b.x1, y: (b.y0 + b.y1) / 2, z: bottom + h / 2 }, w: b.y1 - b.y0, h, size: "4\" SLAB" });
    }
  }
  // piso de madera: solera de asiento sobre el muro de cimentación y, encima, viguetas, viga de borde,
  // bloqueo y subpiso (su cara superior a la cota del nivel)
  if (fl) {
    if (ft.id !== "pier") for (const w of exts) { const { L } = dir(w); along(w, -0.05, L + 0.05, top + T / 2, 5.5 * IN, T, "plate", "P.T. 2x6 SILL"); }
    out.push(...floorSystem(lv, e - SUBFLOOR - fl.d, fl.d));
  }
  return out;
}

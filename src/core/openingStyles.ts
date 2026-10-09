// Tipos de puertas y ventanas: cómo se abren, su símbolo en planta y sus medidas habituales.
// El símbolo se calcula aquí en coordenadas de planta para que la pantalla y el DXF dibujen lo mismo.
import { loc, type Pt } from "./geometry";
import type { Opening, OpeningKind, Wall } from "./model";
import { imperial } from "./units";

export interface OpeningStyle {
  id: string;
  kind: OpeningKind;
  name: string;
  en: string;
  /** Medidas habituales en metros: ancho, alto y antepecho */
  w: number;
  h: number;
  sill?: number;
  /** Tipo de apertura en IFC (IfcDoorTypeOperationEnum o IfcWindowTypePartitioningEnum) */
  ifc: string;
  /** Precio de referencia por pieza (puertas) */
  price?: number;
}

const IN = 0.0254;

export const DOOR_STYLES: OpeningStyle[] = [
  { id: "single", kind: "door", name: "Puerta de una hoja", en: "Single swing door", w: 0.9, h: 2.1, ifc: "SINGLE_SWING", price: 4500 },
  { id: "entry", kind: "door", name: "Puerta principal con vidrios laterales", en: "Entry door with sidelites", w: 1.6, h: 2.1, ifc: "SWING_FIXED_LEFT", price: 14500 },
  { id: "double", kind: "door", name: "Puerta doble", en: "Double swing door", w: 1.5, h: 2.1, ifc: "DOUBLE_DOOR_SINGLE_SWING", price: 9000 },
  { id: "french", kind: "door", name: "Puerta francesa (doble con vidrio)", en: "French door pair", w: 1.5, h: 2.1, ifc: "DOUBLE_DOOR_SINGLE_SWING", price: 16000 },
  { id: "slider", kind: "door", name: "Puerta corrediza de vidrio", en: "Sliding glass patio door", w: 1.8, h: 2.1, ifc: "SLIDING_TO_LEFT", price: 15000 },
  { id: "pocket", kind: "door", name: "Puerta de bolsillo (corrediza empotrada)", en: "Pocket door", w: 0.8, h: 2.1, ifc: "SLIDING_TO_LEFT", price: 6500 },
  { id: "bifold", kind: "door", name: "Puerta plegable (closet)", en: "Bifold closet door", w: 1.2, h: 2.1, ifc: "DOUBLE_DOOR_FOLDING", price: 5200 },
  { id: "barn", kind: "door", name: "Puerta de granero (corrediza aparente)", en: "Barn door, surface sliding", w: 0.9, h: 2.1, ifc: "SLIDING_TO_LEFT", price: 7800 },
  { id: "dutch", kind: "door", name: "Puerta holandesa (dos mitades)", en: "Dutch door", w: 0.9, h: 2.1, ifc: "SINGLE_SWING", price: 8500 },
  { id: "garage", kind: "door", name: "Puerta de cochera seccional", en: "Sectional overhead garage door", w: 9 * 12 * IN, h: 7 * 12 * IN, ifc: "ROLLINGUP", price: 26000 },
];

export const WINDOW_STYLES: OpeningStyle[] = [
  { id: "fixed", kind: "window", name: "Ventana fija", en: "Fixed window", w: 1.2, h: 1.2, sill: 0.9, ifc: "SINGLE_PANEL" },
  { id: "picture", kind: "window", name: "Ventanal fijo (picture)", en: "Picture window", w: 2.0, h: 1.5, sill: 0.6, ifc: "SINGLE_PANEL" },
  { id: "single-hung", kind: "window", name: "Guillotina simple", en: "Single-hung window", w: 0.9, h: 1.4, sill: 0.8, ifc: "DOUBLE_PANEL_HORIZONTAL" },
  { id: "double-hung", kind: "window", name: "Guillotina doble", en: "Double-hung window", w: 0.9, h: 1.4, sill: 0.8, ifc: "DOUBLE_PANEL_HORIZONTAL" },
  { id: "slider", kind: "window", name: "Corrediza horizontal", en: "Horizontal sliding window", w: 1.5, h: 1.0, sill: 1.0, ifc: "DOUBLE_PANEL_VERTICAL" },
  { id: "casement", kind: "window", name: "Abatible (casement)", en: "Casement window", w: 0.6, h: 1.2, sill: 0.9, ifc: "SINGLE_PANEL" },
  { id: "casement2", kind: "window", name: "Abatible doble", en: "Double casement window", w: 1.2, h: 1.2, sill: 0.9, ifc: "DOUBLE_PANEL_VERTICAL" },
  { id: "awning", kind: "window", name: "Proyectante (awning)", en: "Awning window", w: 0.9, h: 0.6, sill: 1.5, ifc: "SINGLE_PANEL" },
  { id: "hopper", kind: "window", name: "Basculante (hopper)", en: "Hopper window", w: 0.9, h: 0.5, sill: 0.3, ifc: "SINGLE_PANEL" },
  { id: "jalousie", kind: "window", name: "Persiana de vidrio (louver)", en: "Jalousie (louvered) window", w: 0.6, h: 1.0, sill: 1.1, ifc: "SINGLE_PANEL" },
];

const ALL = new Map([...DOOR_STYLES, ...WINDOW_STYLES].map((s) => [`${s.kind}:${s.id}`, s]));

/** Tipo de un hueco: el guardado o, si no tiene, puerta de una hoja / ventana fija. */
export function openingStyle(o: { kind: OpeningKind; style?: string }): OpeningStyle {
  return ALL.get(`${o.kind}:${o.style ?? ""}`) ?? (o.kind === "door" ? DOOR_STYLES[0] : WINDOW_STYLES[0]);
}

export const styleName = (s: OpeningStyle) => (imperial() ? s.en : s.name);

/** Trazo del símbolo: hoja (gruesa), barrido (discontinuo), marco o vidrio (finos). */
export interface SymStroke { pts: Pt[]; kind: "leaf" | "swing" | "frame" | "glass" }

/**
 * Símbolo en planta del hueco en el muro. out es el lado exterior (+1 o −1, como n en loc):
 * las ventanas abatibles se abren hacia fuera; las puertas hacia el lado que marca flip.
 */
export function openingSymbol(w: Wall, o: Opening, L: number, out: 1 | -1 = 1): SymStroke[] {
  const st = openingStyle(o), a = o.t * L - o.width / 2, b = o.t * L + o.width / 2, h = w.thick / 2, W = o.width;
  const P = (s: number, n: number) => loc(w, s, n);
  const S: SymStroke[] = [];
  const line = (kind: SymStroke["kind"], ...q: [number, number][]) => S.push({ kind, pts: q.map(([s, n]) => P(s, n)) });
  /** Hoja abatible: bisagra en hs, cierra hacia dir (+1 a lo largo del muro, −1 al revés), hacia el lado sd. */
  const swing = (hs: number, r: number, dir: 1 | -1, sd: number, face = h) => {
    line("leaf", [hs, sd * face], [hs, sd * (face + r)]);
    const arc: [number, number][] = [];
    for (let i = 0; i <= 12; i++) { const t = (i / 12) * (Math.PI / 2); arc.push([hs + dir * r * Math.sin(t), sd * (face + r * Math.cos(t))]); }
    line("swing", ...arc);
  };
  const jambs = () => { line("frame", [a, -h], [a, h]); line("frame", [b, -h], [b, h]); };

  if (o.kind === "door") {
    const sd = o.flip ? -1 : 1;
    jambs();
    switch (st.id) {
      case "double": case "french":
        swing(a, W / 2, 1, sd); swing(b, W / 2, -1, sd);
        break;
      case "entry": {
        // vidrios laterales fijos y la hoja en medio
        const side = Math.min(0.36, W * 0.22);
        line("frame", [a + side, -h], [a + side, h]); line("frame", [b - side, -h], [b - side, h]);
        line("glass", [a, 0], [a + side, 0]); line("glass", [b - side, 0], [b, 0]);
        swing(a + side, W - 2 * side, 1, sd);
        break;
      }
      case "slider": {
        // dos paneles que se solapan en el centro, uno por cada cara del riel
        const m = (a + b) / 2;
        line("leaf", [a, -h / 4], [m + 0.05, -h / 4]); line("leaf", [m - 0.05, h / 4], [b, h / 4]);
        line("swing", [m - W / 4, h / 4 + 0.08], [m + W / 4, h / 4 + 0.08]);
        break;
      }
      case "pocket":
        // la hoja entra en el hueco del muro, junto al vano
        line("leaf", [a + W * 0.35, 0], [b + W * 0.35, 0]);
        line("swing", [b, -h * 0.6], [b + W, -h * 0.6]); line("swing", [b, h * 0.6], [b + W, h * 0.6]); line("swing", [b + W, -h * 0.6], [b + W, h * 0.6]);
        break;
      case "bifold": {
        const q = W / 4, d = W * 0.32;
        line("leaf", [a, sd * h], [a + q, sd * (h + d)], [a + 2 * q, sd * h]);
        line("leaf", [b, sd * h], [b - q, sd * (h + d)], [b - 2 * q, sd * h]);
        break;
      }
      case "barn":
        // hoja por delante del muro, corrida a medio abrir, y su riel
        line("leaf", [a + W * 0.45, sd * (h + 0.04)], [b + W * 0.45 + 0.05, sd * (h + 0.04)]);
        line("swing", [a - 0.05, sd * (h + 0.09)], [b + W + 0.05, sd * (h + 0.09)]);
        break;
      case "garage": {
        // la puerta seccional sube y queda bajo el techo, por dentro
        line("leaf", [a, 0], [b, 0]);
        const d = Math.min(o.height, 2.4);
        line("swing", [a + 0.05, -sd * h], [a + 0.05, -sd * (h + d)], [b - 0.05, -sd * (h + d)], [b - 0.05, -sd * h]);
        break;
      }
      default:
        swing(a, W, 1, sd);
    }
    return S;
  }

  // ventanas: marco con el ancho del muro y la línea del vidrio según cómo abra
  line("frame", [a, -h], [b, -h], [b, h], [a, h], [a, -h]);
  switch (st.id) {
    case "fixed": case "picture":
      line("glass", [a, 0], [b, 0]);
      break;
    case "slider": {
      const m = (a + b) / 2;
      line("glass", [a, -h / 4], [m + 0.04, -h / 4]); line("glass", [m - 0.04, h / 4], [b, h / 4]);
      break;
    }
    case "casement":
      line("glass", [a, 0], [b, 0]);
      swing(a, W, 1, out, h);
      break;
    case "casement2":
      line("glass", [a, 0], [b, 0]);
      swing(a, W / 2, 1, out, h); swing(b, W / 2, -1, out, h);
      break;
    case "jalousie":
      for (let s = a + 0.08; s < b - 0.04; s += 0.1) line("glass", [s - 0.05, -h / 3], [s + 0.05, h / 3]);
      break;
    default:
      line("glass", [a, -h / 3], [b, -h / 3]); line("glass", [a, h / 3], [b, h / 3]);
  }
  return S;
}

/**
 * Líneas de la carpintería vista en alzado, en coordenadas 0..1 del hueco (u a lo ancho, v hacia arriba):
 * montantes, travesaños y el triángulo que indica hacia dónde abre la hoja (el vértice en las bisagras).
 */
export function elevationLines(o: { kind: OpeningKind; style?: string }): { pts: [number, number][]; dash?: boolean }[] {
  const st = openingStyle(o), L: { pts: [number, number][]; dash?: boolean }[] = [];
  const ln = (dash: boolean, ...pts: [number, number][]) => L.push({ pts, dash });
  const tri = (hu: number, hv: number, au: number, av: number, bu: number, bv: number) => ln(true, [au, av], [hu, hv], [bu, bv]);
  if (o.kind === "door") switch (st.id) {
    case "double": case "french":
      ln(false, [0.5, 0], [0.5, 1]);
      if (st.id === "french") for (const u0 of [0, 0.5]) ln(false, [u0 + 0.08, 0.3], [u0 + 0.42, 0.3], [u0 + 0.42, 0.92], [u0 + 0.08, 0.92], [u0 + 0.08, 0.3]);
      tri(0, 0.5, 0.5, 1, 0.5, 0); tri(1, 0.5, 0.5, 1, 0.5, 0);
      break;
    case "entry":
      ln(false, [0.22, 0], [0.22, 1]); ln(false, [0.78, 0], [0.78, 1]);
      tri(0.22, 0.5, 0.78, 1, 0.78, 0);
      break;
    case "slider":
      ln(false, [0.5, 0], [0.5, 1]);
      ln(true, [0.62, 0.5], [0.85, 0.5]); ln(true, [0.8, 0.54], [0.85, 0.5], [0.8, 0.46]);
      break;
    case "bifold":
      for (const u of [0.25, 0.5, 0.75]) ln(false, [u, 0], [u, 1]);
      break;
    case "barn":
      ln(false, [-0.05, 1.04], [1.6, 1.04]); ln(false, [0.05, 0.1], [0.95, 0.9]); ln(false, [0.05, 0.9], [0.95, 0.1]);
      break;
    case "dutch":
      ln(false, [0, 0.52], [1, 0.52]); tri(0, 0.5, 1, 1, 1, 0);
      break;
    case "garage":
      for (const v of [0.25, 0.5, 0.75]) ln(false, [0, v], [1, v]);
      for (let u = 0.1; u < 0.95; u += 0.135) ln(false, [u, 0.78], [u + 0.09, 0.78], [u + 0.09, 0.95], [u, 0.95], [u, 0.78]);
      break;
    case "pocket":
      ln(true, [0.6, 0.5], [0.9, 0.5]); ln(true, [0.85, 0.54], [0.9, 0.5], [0.85, 0.46]);
      break;
    default:
      tri(0, 0.5, 1, 1, 1, 0);
  }
  else switch (st.id) {
    case "single-hung": case "double-hung":
      ln(false, [0, 0.5], [1, 0.5]);
      if (st.id === "double-hung") { ln(true, [0.5, 0.62], [0.5, 0.88]); ln(true, [0.5, 0.38], [0.5, 0.12]); }
      else ln(true, [0.5, 0.15], [0.5, 0.4]);
      break;
    case "slider":
      ln(false, [0.5, 0], [0.5, 1]); ln(true, [0.62, 0.5], [0.85, 0.5]);
      break;
    case "casement": tri(0, 0.5, 1, 1, 1, 0); break;
    case "casement2": ln(false, [0.5, 0], [0.5, 1]); tri(0, 0.5, 0.5, 1, 0.5, 0); tri(1, 0.5, 0.5, 1, 0.5, 0); break;
    case "awning": tri(0.5, 1, 0, 0, 1, 0); break;
    case "hopper": tri(0.5, 0, 0, 1, 1, 1); break;
    case "jalousie": for (let v = 0.1; v < 1; v += 0.1) ln(false, [0, v], [1, v]); break;
    case "picture": break;
    default: break;
  }
  return L;
}

import type { Pt } from "./geometry";
import type { Furniture } from "./model";
import { MORE } from "./furnitureMore";

/** Polilínea de la representación en planta, en coordenadas locales (metros, origen en el centro). */
export interface Stroke { pts: Pt[]; closed?: boolean }

export interface FurnitureDef {
  kind: string;
  /** Grupo del catálogo */
  cat: string;
  label: string;
  /** Ancho (x local), fondo (y local) y alto */
  w: number;
  d: number;
  h: number;
  /** Clase IFC y tipo predefinido */
  ifc: { cls: "IFCFURNITURE" | "IFCSANITARYTERMINAL" | "IFCBUILDINGELEMENTPROXY" | "IFCGEOGRAPHICELEMENT"; type: string };
  draw: () => Stroke[];
  /** Volúmenes para el 3D y el IFC (por defecto, la caja envolvente) */
  solids?: () => Solid[];
}

/** Prisma en coordenadas locales: centro (x, y), lados w y d, desde z0 con altura h. */
export interface Solid {
  x: number; y: number; w: number; d: number; z0: number; h: number;
  /** Forma en el 3D (caja si no se indica); en IFC siempre sale como caja */
  shape?: "cyl" | "sphere" | "cone";
  /** Color propio en el 3D (vegetación, vehículos, personas, agua) */
  color?: string;
}

const rect = (x0: number, y0: number, x1: number, y1: number): Stroke =>
  ({ pts: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], closed: true });
const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 20): Stroke =>
  ({ pts: Array.from({ length: n }, (_, i) => ({ x: cx + rx * Math.cos((i / n) * Math.PI * 2), y: cy + ry * Math.sin((i / n) * Math.PI * 2) })), closed: true });
const line = (x0: number, y0: number, x1: number, y1: number): Stroke => ({ pts: [{ x: x0, y: y0 }, { x: x1, y: y1 }] });
const box = (w: number, d: number) => rect(-w / 2, -d / 2, w / 2, d / 2);

/** Cama doble de ancho w y 80" de largo, con dos almohadas. */
function usBed(kind: string, label: string, w: number): FurnitureDef {
  const d = 2.032, x = w / 2, y = d / 2;
  return {
    kind, cat: "Dormitorio", label, w, d, h: 0.55, ifc: { cls: "IFCFURNITURE", type: "BED" },
    draw: () => [box(w, d), rect(-x + 0.1, -y + 0.08, -0.06, -y + 0.4), rect(0.06, -y + 0.08, x - 0.1, -y + 0.4), line(-x, -y + 0.65, x, -y + 0.65), line(-x, y - 0.9, x, y - 1.2)],
  };
}

/** El lado -y local es el fondo (cabecero, respaldo, pared); el +y es el frente. */
export const FURNITURE: FurnitureDef[] = [
  {
    kind: "bed2", cat: "Dormitorio", label: "Cama doble", w: 1.6, d: 2.0, h: 0.5, ifc: { cls: "IFCFURNITURE", type: "BED" },
    draw: () => [box(1.6, 2), rect(-0.7, -0.92, -0.08, -0.6), rect(0.08, -0.92, 0.7, -0.6), line(-0.8, -0.35, 0.8, -0.35), line(-0.8, 0.1, 0.8, -0.2)],
  },
  // medidas de colchón de EE.UU.: queen 60" × 80", king 76" × 80"
  usBed("bedq", "Cama queen (EE.UU.)", 1.524),
  usBed("bedk", "Cama king (EE.UU.)", 1.93),
  {
    kind: "bed1", cat: "Dormitorio", label: "Cama individual", w: 0.9, d: 2.0, h: 0.5, ifc: { cls: "IFCFURNITURE", type: "BED" },
    draw: () => [box(0.9, 2), rect(-0.35, -0.92, 0.35, -0.6), line(-0.45, -0.35, 0.45, -0.35), line(-0.45, 0.1, 0.45, -0.15)],
  },
  {
    kind: "sofa", cat: "Estar", label: "Sofá", w: 2.0, d: 0.9, h: 0.8, ifc: { cls: "IFCFURNITURE", type: "SOFA" },
    draw: () => [box(2, 0.9), rect(-1, -0.45, 1, -0.2), rect(-1, -0.2, -0.82, 0.45), rect(0.82, -0.2, 1, 0.45), line(0, -0.2, 0, 0.45)],
  },
  {
    kind: "dining", cat: "Comedor", label: "Mesa y 6 sillas", w: 1.6, d: 1.9, h: 0.75, ifc: { cls: "IFCFURNITURE", type: "TABLE" },
    draw: () => {
      const s: Stroke[] = [rect(-0.8, -0.45, 0.8, 0.45)];
      for (const x of [-0.5, 0, 0.5]) s.push(rect(x - 0.21, -0.95, x + 0.21, -0.53), rect(x - 0.21, 0.53, x + 0.21, 0.95));
      return s;
    },
    solids: () => [
      { x: 0, y: 0, w: 1.6, d: 0.9, z0: 0.7, h: 0.05 }, { x: 0, y: 0, w: 1.3, d: 0.6, z0: 0, h: 0.7 },
      ...[-0.5, 0, 0.5].flatMap((x) => [{ x, y: -0.74, w: 0.42, d: 0.42, z0: 0, h: 0.45 }, { x, y: 0.74, w: 0.42, d: 0.42, z0: 0, h: 0.45 }]),
    ],
  },
  {
    kind: "desk", cat: "Oficina", label: "Escritorio", w: 1.2, d: 1.1, h: 0.75, ifc: { cls: "IFCFURNITURE", type: "DESK" },
    draw: () => [rect(-0.6, -0.55, 0.6, 0.05), rect(-0.22, 0.12, 0.22, 0.55), line(-0.22, 0.2, 0.22, 0.2)],
    solids: () => [{ x: 0, y: -0.25, w: 1.2, d: 0.6, z0: 0, h: 0.75 }, { x: 0, y: 0.33, w: 0.44, d: 0.43, z0: 0, h: 0.45 }],
  },
  {
    kind: "wardrobe", cat: "Dormitorio", label: "Armario", w: 1.2, d: 0.6, h: 2.1, ifc: { cls: "IFCFURNITURE", type: "SHELF" },
    draw: () => [box(1.2, 0.6), line(-0.6, 0, 0.6, 0), line(0, 0.3, 0, 0.22), ...[-0.45, -0.3, -0.15, 0.15, 0.3, 0.45].map((x) => line(x, -0.08, x + 0.04, 0.08))],
  },
  {
    kind: "kitchen", cat: "Cocina y lavado", label: "Encimera de cocina", w: 2.4, d: 0.6, h: 0.9, ifc: { cls: "IFCFURNITURE", type: "NOTDEFINED" },
    draw: () => [box(2.4, 0.6), rect(-1.05, -0.2, -0.35, 0.2), ellipse(0.45, -0.1, 0.09, 0.09, 14), ellipse(0.75, -0.1, 0.09, 0.09, 14), ellipse(0.45, 0.15, 0.07, 0.07, 14), ellipse(0.75, 0.15, 0.07, 0.07, 14)],
  },
  {
    kind: "fridge", cat: "Cocina y lavado", label: "Frigorífico", w: 0.7, d: 0.7, h: 1.8, ifc: { cls: "IFCFURNITURE", type: "NOTDEFINED" },
    draw: () => [box(0.7, 0.7), line(-0.35, -0.35, 0.35, 0.35), line(-0.35, 0.35, 0.35, -0.35)],
  },
  {
    kind: "wc", cat: "Baño", label: "Inodoro", w: 0.4, d: 0.7, h: 0.75, ifc: { cls: "IFCSANITARYTERMINAL", type: "TOILETPAN" },
    draw: () => [rect(-0.2, -0.35, 0.2, -0.17), ellipse(0, 0.08, 0.18, 0.25)],
    solids: () => [{ x: 0, y: -0.26, w: 0.4, d: 0.18, z0: 0, h: 0.8 }, { x: 0, y: 0.08, w: 0.36, d: 0.5, z0: 0, h: 0.4 }],
  },
  {
    kind: "basin", cat: "Baño", label: "Lavabo", w: 0.6, d: 0.45, h: 0.85, ifc: { cls: "IFCSANITARYTERMINAL", type: "WASHHANDBASIN" },
    draw: () => [box(0.6, 0.45), ellipse(0, 0.03, 0.22, 0.15), ellipse(0, -0.16, 0.025, 0.025, 8)],
    solids: () => [{ x: 0, y: 0, w: 0.6, d: 0.45, z0: 0.7, h: 0.15 }, { x: 0, y: -0.08, w: 0.16, d: 0.16, z0: 0, h: 0.7 }],
  },
  {
    kind: "shower", cat: "Baño", label: "Plato de ducha", w: 0.9, d: 0.9, h: 0.05, ifc: { cls: "IFCSANITARYTERMINAL", type: "SHOWER" },
    draw: () => [box(0.9, 0.9), line(-0.45, -0.45, 0.45, 0.45), line(-0.45, 0.45, 0.45, -0.45), ellipse(0, 0, 0.05, 0.05, 10)],
  },
  {
    kind: "bath", cat: "Baño", label: "Bañera", w: 1.7, d: 0.75, h: 0.55, ifc: { cls: "IFCSANITARYTERMINAL", type: "BATH" },
    draw: () => [box(1.7, 0.75), ellipse(0.05, 0, 0.72, 0.29, 28), ellipse(-0.6, 0, 0.03, 0.03, 8)],
  },
  ...MORE,
];

/** Grupos del catálogo, en el orden en que se muestran. */
export const FURNITURE_CATS = [...new Set(FURNITURE.map((f) => f.cat))];

export const furnitureDef = (kind: string) => FURNITURE.find((f) => f.kind === kind) ?? FURNITURE[0];

/** Pasa un punto local de la pieza a coordenadas de planta. */
export function furnitureToPlan(f: Pick<Furniture, "x" | "y" | "rot">, p: Pt): Pt {
  const a = (f.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return { x: f.x + p.x * c - p.y * s, y: f.y + p.x * s + p.y * c };
}

/** Contorno de la pieza (su rectángulo envolvente girado) en planta. */
export function furnitureOutline(f: Furniture): Pt[] {
  const d = furnitureDef(f.kind);
  return box(d.w, d.d).pts.map((p) => furnitureToPlan(f, p));
}

/** Trazos de la planta ya colocados. */
export function furnitureStrokes(f: Pick<Furniture, "x" | "y" | "rot" | "kind">): Stroke[] {
  return furnitureDef(f.kind).draw().map((s) => ({ ...s, pts: s.pts.map((p) => furnitureToPlan(f, p)) }));
}

/** Volúmenes de la pieza en coordenadas locales. */
export function furnitureSolids(kind: string): Solid[] {
  const d = furnitureDef(kind);
  return d.solids?.() ?? [{ x: 0, y: 0, w: d.w, d: d.d, z0: 0, h: d.h }];
}

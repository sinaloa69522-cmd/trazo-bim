import { feetInches, imperial } from "./units";
/** Trama con la que se dibuja la sección del muro en planta. */
export type Hatch = "brick" | "block" | "concrete" | "drywall" | "solid";

/** Tipo de muro del catálogo, como los tipos de familia de Revit. */
export interface WallType {
  id: string;
  name: string;
  /** Espesor del tipo; el genérico admite cualquiera */
  thick: number;
  hatch: Hatch;
  /** Material principal (va al IFC) */
  material: string;
}

export const GENERIC = "generico";

export const WALL_TYPES: WallType[] = [
  { id: "fachada-ladrillo", name: "Fachada de ladrillo 25", thick: 0.25, hatch: "brick", material: "Ladrillo cerámico" },
  { id: "fachada-bloque", name: "Bloque de hormigón 20", thick: 0.2, hatch: "block", material: "Bloque de hormigón" },
  { id: "muro-hormigon", name: "Muro de hormigón 30", thick: 0.3, hatch: "concrete", material: "Hormigón armado" },
  { id: "tabique-ladrillo", name: "Tabique de ladrillo 12", thick: 0.12, hatch: "brick", material: "Ladrillo cerámico" },
  { id: "tabique-yeso", name: "Tabique de placa de yeso 10", thick: 0.1, hatch: "drywall", material: "Placa de yeso laminado" },
  // EE.UU.: montantes de madera con placa de yeso a ambos lados (y tablero exterior en el de 2x6)
  { id: "us-2x6", name: "Bastidor de madera 2x6 (exterior, EE.UU.)", thick: 0.1651, hatch: "drywall", material: "Madera (wood frame 2x6)" },
  { id: "us-2x4", name: "Bastidor de madera 2x4 (interior, EE.UU.)", thick: 0.1143, hatch: "drywall", material: "Madera (wood frame 2x4)" },
  { id: "us-cmu8", name: "Block CMU 8\" (EE.UU.)", thick: 0.2032, hatch: "block", material: "Block de concreto (CMU)" },
  { id: GENERIC, name: "Muro genérico", thick: 0.15, hatch: "solid", material: "Genérico" },
];

export function wallType(id: string): WallType {
  return WALL_TYPES.find((t) => t.id === id) ?? WALL_TYPES[WALL_TYPES.length - 1];
}

/** Tipo para un muro guardado sin tipo: el del catálogo con su espesor, o el genérico. */
export function typeForThick(thick: number): string {
  return WALL_TYPES.find((t) => t.id !== GENERIC && Math.abs(t.thick - thick) < 1e-6)?.id ?? GENERIC;
}

/** Nombre que se muestra: el genérico lleva su espesor. */
export function wallTypeLabel(w: { type: string; thick: number }) {
  const t = wallType(w.type);
  return t.id === GENERIC ? `${t.name} ${imperial() ? feetInches(w.thick) : Math.round(w.thick * 100)}` : t.name;
}

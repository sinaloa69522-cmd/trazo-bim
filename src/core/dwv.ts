// Cargas de drenaje para el riser diagram de EE.UU.: unidades de descarga (DFU) por mueble según IRC Tabla
// P3004.1, sifón mínimo según P3201.7 y diámetro del drenaje del edificio a ¼"/ft según P3005.4.2.

import type { Project } from "./model";

export interface DwvRow { kind: string; name: string; count: number; dfu: number; trap: string }

const FIX: [string, string, number, string][] = [
  ["wc", "Water closet, 1.6 gpf", 3, '3" (integral)'],
  ["basin", "Lavatory", 1, '1¼"'],
  ["shower", "Shower", 2, '2"'],
  ["bath", "Bathtub / tub-shower", 2, '1½"'],
  ["kitchen", "Kitchen sink (with dishwasher)", 2, '1½"'],
];

/** Tamaño del drenaje horizontal del edificio a ¼"/ft por DFU (IRC Tabla P3005.4.2); 3" mínimo con inodoro. */
const DRAIN: [number, string][] = [[21, '2"'], [24, '2½"'], [42, '3"'], [216, '4"'], [480, '5"']];

export function dwvLoad(p: Project) {
  const rows: DwvRow[] = [];
  for (const [kind, name, dfu, trap] of FIX) {
    const count = p.levels.reduce((t, l) => t + l.furniture.filter((f) => f.kind === kind).length, 0);
    if (count) rows.push({ kind, name, count, dfu, trap });
  }
  const total = rows.reduce((t, r) => t + r.count * r.dfu, 0);
  let drain = DRAIN.find(([max]) => total <= max)?.[1] ?? '6"';
  if (rows.some((r) => r.kind === "wc") && parseFloat(drain) < 3) drain = '3"';
  return { rows, total, drain, wcs: rows.find((r) => r.kind === "wc")?.count ?? 0 };
}

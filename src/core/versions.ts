// Historial de versiones del proyecto: copias con nombre guardadas en el navegador, para volver a una anterior.
import { builtArea } from "./rooms";
import type { Project } from "./model";

export interface Version {
  id: string;
  name: string;
  /** Fecha ISO de cuando se guardó */
  at: string;
  /** Resumen para la lista: niveles, muros, superficie construida */
  summary: { levels: number; walls: number; openings: number; area: number };
  /** El proyecto en JSON */
  data: string;
}

export const VERSIONS_KEY = "trazo-bim:versions";
/** Máximo de versiones guardadas: al pasarlo se borra la más antigua. */
export const MAX_VERSIONS = 40;

type Store = Pick<Storage, "getItem" | "setItem">;

export function listVersions(s: Store | null): Version[] {
  try { const v = JSON.parse(s?.getItem(VERSIONS_KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

export function summarize(p: Project): Version["summary"] {
  return {
    levels: p.levels.length,
    walls: p.levels.reduce((n, l) => n + l.walls.length, 0),
    openings: p.levels.reduce((n, l) => n + l.openings.length, 0),
    area: Math.round(p.levels.reduce((a, l) => a + builtArea(l), 0) * 100) / 100,
  };
}

/**
 * Guarda una versión al principio de la lista. Si no cabe en el almacenamiento se van quitando las más
 * antiguas; devuelve la lista guardada o null si ni sola cabe.
 */
export function addVersion(s: Store | null, p: Project, name: string, now = new Date()): Version[] | null {
  if (!s) return null;
  const v: Version = { id: `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: name.trim() || "Sin nombre", at: now.toISOString(), summary: summarize(p), data: JSON.stringify(p) };
  for (let list = [v, ...listVersions(s)].slice(0, MAX_VERSIONS); list.length; list = list.slice(0, -1)) {
    try { s.setItem(VERSIONS_KEY, JSON.stringify(list)); return list; } catch { /* no cabe: se quita la más antigua */ }
  }
  return null;
}

export function removeVersion(s: Store | null, id: string): Version[] {
  const list = listVersions(s).filter((v) => v.id !== id);
  try { s?.setItem(VERSIONS_KEY, JSON.stringify(list)); } catch { /* sin almacenamiento */ }
  return list;
}

export function renameVersion(s: Store | null, id: string, name: string): Version[] {
  const list = listVersions(s).map((v) => (v.id === id ? { ...v, name: name.trim() || v.name } : v));
  try { s?.setItem(VERSIONS_KEY, JSON.stringify(list)); } catch { /* sin almacenamiento */ }
  return list;
}

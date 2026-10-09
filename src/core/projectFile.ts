import { normalizeProject, type Project } from "./model";

/** Formato del archivo de proyecto (.trazo): JSON con una cabecera para reconocerlo y versionarlo. */
export const FILE_FORMAT = "trazo-bim";
export const FILE_VERSION = 1;
export const FILE_EXT = ".trazo";

export function serializeProject(p: Project, now = new Date()): string {
  return JSON.stringify({ format: FILE_FORMAT, version: FILE_VERSION, savedAt: now.toISOString(), project: p }, null, 1);
}

/**
 * Lee un archivo de proyecto. Acepta también el JSON del proyecto sin cabecera (copias de seguridad antiguas).
 * Lanza un error con un mensaje para el usuario si el archivo no es un proyecto.
 */
export function parseProjectFile(text: string): Project {
  let raw: unknown;
  try { raw = JSON.parse(text.replace(/^﻿/, "")); } catch { throw new Error("El archivo no es un proyecto de Smartarchitect (no es JSON válido)."); }
  if (!raw || typeof raw !== "object") throw new Error("El archivo no es un proyecto de Smartarchitect.");
  const r = raw as { format?: string; version?: number; project?: unknown; levels?: unknown; walls?: unknown };
  if (r.format !== undefined && r.format !== FILE_FORMAT) throw new Error(`Formato desconocido: "${r.format}".`);
  if (r.format === FILE_FORMAT && (r.version ?? 0) > FILE_VERSION)
    throw new Error("El proyecto se guardó con una versión más nueva de Smartarchitect. Actualiza la aplicación para abrirlo.");
  const body = r.format === FILE_FORMAT ? r.project : raw;
  const b = body as { levels?: unknown; walls?: unknown } | null;
  if (!b || (!Array.isArray(b.levels) && !Array.isArray(b.walls))) throw new Error("El archivo no contiene ningún nivel ni muro.");
  return normalizeProject(body);
}

/** Nombre de archivo a partir del nombre del proyecto. */
export function projectFileName(name: string) {
  const slug = (name || "proyecto").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "proyecto"}${FILE_EXT}`;
}

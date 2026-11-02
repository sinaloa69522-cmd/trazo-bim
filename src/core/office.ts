// Datos del despacho: nombre, logo, responsable con su cédula profesional y firma, para el cajetín de todas
// las láminas, la memoria y la presentación. Se guardan en el proyecto y, como valor por omisión para los
// proyectos nuevos, en este navegador.
import type { Office, Project } from "./model";

const KEY = "trazo-office";

export const emptyOffice = (): Office => ({ name: "", responsible: "", license: "" });

/** Despacho guardado en este navegador, o null. */
export function savedOffice(): Office | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Office;
    return o && typeof o === "object" ? { ...emptyOffice(), ...o } : null;
  } catch { return null; }
}

export function saveOffice(o: Office) {
  try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* sin almacenamiento: queda solo en el proyecto */ }
}

/** Despacho que firma el proyecto: el suyo, o el guardado en el navegador. */
export function officeOf(p: Project): Office | null {
  const o = p.info.office ?? savedOffice();
  return o && hasOffice(o) ? o : null;
}

export const hasOffice = (o: Office) => !!(o.name || o.responsible || o.license || o.logo || o.sign);

/** Nombre del responsable con su cédula, para firmas y cuadros: "Arq. Ana Ruiz · Céd. prof. 1234567". */
export function responsibleLine(o: Office | null, fallback = "", en = false) {
  if (!o) return fallback;
  return [o.responsible || fallback, o.license && `${en ? "License" : "Céd. prof."} ${o.license}`].filter(Boolean).join(" · ");
}

import { fmtElev } from "./units";
import type { Mark, MarkKind, Project } from "./model";
import type { Pt } from "./geometry";

export const MARK_KINDS: { id: MarkKind; name: string; hint: string }[] = [
  { id: "nivel", name: "Nivel en planta", hint: "Clic donde va el rótulo. Toma la cota del nivel; el desnivel (patios, baños) se cambia en Propiedades." },
  { id: "detalle", name: "Llamada de detalle", hint: "Clic en el centro de la zona, otro para su radio y otro donde va el globo." },
  { id: "nota", name: "Nota con flecha", hint: "Clic en lo que se señala, otro donde va el texto, y escribe la nota." },
];

/** Prefijos de nivel habituales (ver la tabla de abreviaturas de las láminas). */
export const LEVEL_TAGS: [string, string][] = [
  ["N.P.T.", "Nivel de piso terminado"], ["N.T.N.", "Nivel de terreno natural"],
  ["N.L.A.", "Nivel de lecho alto de losa"], ["N.L.B.", "Nivel de lecho bajo de losa"],
];

/** Medidas del símbolo en píxeles de papel, como las marcas de sección. */
export const MARK_PX = { font: 9, char: 5.5, boxH: 14, bubble: 12, noteFont: 10 };

/** Texto del rótulo de nivel: prefijo y cota (la del nivel más el desnivel). */
export function levelText(mk: Mark, elev: number) {
  return `${mk.label} ${fmtElev(elev + (mk.dz ?? 0))}`.trim();
}

/** Siguiente número libre de llamada de detalle en todo el proyecto. */
export function nextDetailNum(p: Project) {
  const used = p.levels.flatMap((l) => (l.marks ?? []).filter((m) => m.kind === "detalle").map((m) => parseInt(m.label, 10))).filter(Number.isFinite);
  return String(used.length ? Math.max(...used) + 1 : 1);
}

/** Ancho aproximado en píxeles de un texto del símbolo. */
export const textPx = (s: string, font = MARK_PX.font) => s.length * font * 0.61;

/**
 * Distancia (en metros de modelo) del punto al símbolo, o Infinity si no lo toca.
 * s son los píxeles por metro de la vista y tol la tolerancia en píxeles.
 */
export function markHit(mk: Mark, elev: number, q: Pt, s: number, tol = 6): number {
  const dx = (q.x - mk.x) * s, dy = (q.y - mk.y) * s;
  if (mk.kind === "nivel") {
    const w = textPx(levelText(mk, elev)) + 10;
    return Math.abs(dx) <= w / 2 + tol && Math.abs(dy) <= MARK_PX.boxH / 2 + tol ? Math.hypot(dx, dy) / s * 0.5 : Infinity;
  }
  if (mk.kind === "detalle") {
    const db = Math.hypot(dx, dy);
    if (db <= MARK_PX.bubble + tol) return db / s * 0.5;
    const a = { x: mk.ax ?? mk.x, y: mk.ay ?? mk.y }, ring = Math.abs(Math.hypot(q.x - a.x, q.y - a.y) - (mk.r ?? 0)) * s;
    return ring <= tol ? ring / s : Infinity;
  }
  // nota: el texto o la directriz
  const right = mk.x >= (mk.ax ?? mk.x), w = textPx(mk.label, MARK_PX.noteFont) + 14;
  const tx = right ? dx : -dx;
  if (tx >= -tol && tx <= w + tol && Math.abs(dy) <= MARK_PX.noteFont / 2 + tol) return 0.01;
  const a = { x: mk.ax ?? mk.x, y: mk.ay ?? mk.y }, L = Math.hypot(mk.x - a.x, mk.y - a.y);
  if (L < 1e-9) return Infinity;
  const t = Math.max(0, Math.min(1, ((q.x - a.x) * (mk.x - a.x) + (q.y - a.y) * (mk.y - a.y)) / (L * L)));
  const d = Math.hypot(q.x - (a.x + (mk.x - a.x) * t), q.y - (a.y + (mk.y - a.y) * t)) * s;
  return d <= tol ? d / s : Infinity;
}

/** Puntos del modelo que ocupa el símbolo, para encuadrar. */
export function markPts(mk: Mark): Pt[] {
  const pts = [{ x: mk.x, y: mk.y }];
  if (mk.ax !== undefined && mk.ay !== undefined) {
    const r = mk.r ?? 0;
    pts.push({ x: mk.ax - r, y: mk.ay - r }, { x: mk.ax + r, y: mk.ay + r });
  }
  return pts;
}

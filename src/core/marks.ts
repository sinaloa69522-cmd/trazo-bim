import { fmtElev } from "./units";
import type { Mark, MarkKind, Project } from "./model";
import type { Pt } from "./geometry";

export const MARK_KINDS: { id: MarkKind; name: string; hint: string }[] = [
  { id: "nivel", name: "Nivel en planta", hint: "Clic donde va el rótulo. Toma la cota del nivel; el desnivel (patios, baños) se cambia en Propiedades." },
  { id: "detalle", name: "Llamada de detalle", hint: "Clic en el centro de la zona, otro para su radio y otro donde va el globo." },
  { id: "nota", name: "Nota con flecha", hint: "Clic en lo que se señala, otro donde va el texto, y escribe la nota." },
  { id: "nube", name: "Nube de revisión", hint: "Clic en una esquina de lo que cambió y otro en la esquina opuesta; el triángulo lleva el número de la revisión vigente." },
];

/** Revisión vigente del proyecto (la última de la tabla), o "1" si aún no hay ninguna. */
export function currentRev(p: Project) {
  const r = p.info.revisions ?? [];
  return r.length ? r[r.length - 1].no : "1";
}

/** Siguiente número de revisión: sigue la secuencia de la última (1, 2, 3… o A, B, C…). */
export function nextRevNo(p: Project) {
  const r = p.info.revisions ?? [];
  if (!r.length) return "1";
  const last = r[r.length - 1].no.trim(), n = parseInt(last, 10);
  if (Number.isFinite(n) && String(n) === last) return String(n + 1);
  if (/^[A-Y]$/i.test(last)) return String.fromCharCode(last.charCodeAt(0) + 1);
  return String(r.length + 1);
}

/**
 * Contorno de la nube de revisión en coordenadas de modelo: el rectángulo de a a b recorrido con
 * arcos de medio círculo hacia afuera, de cuerda cercana a step. Devuelve la polilínea cerrada.
 */
export function cloudPoints(a: Pt, b: Pt, step: number): Pt[] {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const corners = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const out: Pt[] = [];
  for (let i = 0; i < 4; i++) {
    const p = corners[i], q = corners[(i + 1) % 4], L = Math.hypot(q.x - p.x, q.y - p.y);
    const n = Math.max(1, Math.round(L / Math.max(step, 1e-6)));
    for (let k = 0; k < n; k++) {
      const s = { x: p.x + ((q.x - p.x) * k) / n, y: p.y + ((q.y - p.y) * k) / n };
      const e = { x: p.x + ((q.x - p.x) * (k + 1)) / n, y: p.y + ((q.y - p.y) * (k + 1)) / n };
      const m = { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 }, r = Math.hypot(e.x - s.x, e.y - s.y) / 2;
      if (r < 1e-9) continue;
      const a0 = Math.atan2(s.y - m.y, s.x - m.x);
      // el arco va del inicio al final por el lado que se aleja del centro del rectángulo
      const mid = a0 + Math.PI / 2, sg = Math.cos(mid) * (m.x - cx) + Math.sin(mid) * (m.y - cy) >= 0 ? 1 : -1;
      for (let j = 0; j < 8; j++) {
        const t = a0 + (sg * Math.PI * j) / 8;
        out.push({ x: m.x + r * Math.cos(t), y: m.y + r * Math.sin(t) });
      }
    }
  }
  if (out.length) out.push(out[0]);
  return out;
}

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
  if (mk.kind === "nube") {
    if (Math.hypot(dx, dy) <= MARK_PX.bubble + tol) return 0.01;
    const x0 = Math.min(mk.x, mk.ax ?? mk.x), x1 = Math.max(mk.x, mk.ax ?? mk.x), y0 = Math.min(mk.y, mk.ay ?? mk.y), y1 = Math.max(mk.y, mk.ay ?? mk.y);
    const inX = q.x >= x0 - tol / s && q.x <= x1 + tol / s, inY = q.y >= y0 - tol / s && q.y <= y1 + tol / s;
    const d = Math.min(inY ? Math.min(Math.abs(q.x - x0), Math.abs(q.x - x1)) : Infinity, inX ? Math.min(Math.abs(q.y - y0), Math.abs(q.y - y1)) : Infinity) * s;
    return d <= tol + 4 ? d / s : Infinity;
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
  if (mk.kind === "nube" && mk.ax !== undefined && mk.ay !== undefined) pts.push({ x: mk.ax, y: mk.ay });
  else if (mk.ax !== undefined && mk.ay !== undefined) {
    const r = mk.r ?? 0;
    pts.push({ x: mk.ax - r, y: mk.ay - r }, { x: mk.ax + r, y: mk.ay + r });
  }
  return pts;
}

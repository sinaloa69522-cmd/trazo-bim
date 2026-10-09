/**
 * Unidades del proyecto. El modelo siempre guarda metros; esto solo cambia cómo se escriben y se leen
 * las medidas: métrico (4.50 m, 12.30 m²) o imperial de Estados Unidos (12'-6", 132 sq ft).
 */
export type UnitSystem = "metric" | "imperial";

export const FT = 0.3048;
export const IN = 0.0254;
const SQFT = FT * FT;

let current: UnitSystem = "metric";
/** El editor la fija cada vez que cambia el proyecto. */
export function setUnitSystem(u: UnitSystem) { current = u; }
export const unitSystem = () => current;
export const imperial = () => current === "imperial";

const FRACTIONS: Record<number, string> = { 1: "1/8", 2: "1/4", 3: "3/8", 4: "1/2", 5: "5/8", 6: "3/4", 7: "7/8" };

/** Pies y pulgadas al 1/8" (o al paso que se pida, en octavos): 12'-6 1/2", 0'-4 1/2" → 4 1/2". */
export function feetInches(m: number, eighths = 1, alwaysFeet = false): string {
  const sign = m < 0 ? "-" : "";
  let e = Math.round(Math.abs(m) / IN * 8 / eighths) * eighths;
  const ft = Math.floor(e / 96);
  e -= ft * 96;
  const inch = Math.floor(e / 8), frac = e - inch * 8;
  const g = gcdFrac(frac);
  const ins = frac ? (inch || ft ? `${inch} ${g}` : g) : String(inch);
  return ft || alwaysFeet ? `${sign}${ft}'-${frac && !inch && !ft ? `0 ${g}` : ins}"` : `${sign}${ins}"`;
}
const gcdFrac = (f: number) => FRACTIONS[f] ?? "";

/** Longitud con su unidad: "4.50 m" o 14'-9". */
export function fmtLen(m: number, u = current): string {
  return u === "imperial" ? feetInches(m) : `${m.toFixed(2)} m`;
}
/** Texto de cota: "4.50" o 14'-9" (al 1/4"). */
export function fmtDim(m: number, u = current): string {
  return u === "imperial" ? feetInches(m, 2) : m.toFixed(2);
}
/** Cota de nivel: "+3.00" o +10'-0". */
export function fmtElev(m: number, u = current): string {
  return (m >= 0 ? "+" : "") + (u === "imperial" ? feetInches(m, 1, true) : m.toFixed(2));
}
/** Valor para un campo editable (sin "m" en métrico). */
export function fmtField(m: number, digits = 2, u = current): string {
  return u === "imperial" ? feetInches(m) : m.toFixed(digits);
}
/** Medidas cortas (peldaños, juntas): "17.5 cm" o 7 1/4". */
export function fmtSmall(m: number, u = current): string {
  return u === "imperial" ? feetInches(m) : `${(m * 100).toFixed(1)} cm`;
}
/** Superficie: "12.50 m²" o "135 sq ft". */
export function fmtArea(m2: number, u = current): string {
  return u === "imperial" ? `${Math.round(m2 / SQFT).toLocaleString("en-US")} sq ft` : `${m2.toFixed(2)} m²`;
}
/** Solo el número de la superficie, para tablas: "12.50" o "135". */
export function areaNum(m2: number, u = current): string {
  return u === "imperial" ? Math.round(m2 / SQFT).toLocaleString("en-US") : m2.toFixed(2);
}
export const areaUnit = (u = current) => (u === "imperial" ? "sq ft" : "m²");
export const lenUnit = (u = current) => (u === "imperial" ? "ft-in" : "m");

/**
 * Lee una longitud tecleada y la devuelve en metros (NaN si no se entiende).
 * Siempre valen las unidades explícitas: 2.5m, 30cm, 12', 6", 12'6", 12'-6 1/2", 12ft 6in.
 * Un número solo se entiende en la unidad del proyecto: metros, o pies en imperial.
 */
export function parseLen(text: string, u = current): number {
  const s = text.trim().toLowerCase().replace(/,/g, ".").replace(/[′’]/g, "'").replace(/[″”]/g, '"').replace(/''/g, '"');
  if (!s) return NaN;
  let m = s.match(/^(-?\d*\.?\d+)\s*(m|cm|mm)$/);
  if (m) return parseFloat(m[1]) * (m[2] === "m" ? 1 : m[2] === "cm" ? 0.01 : 0.001);
  // pies y pulgadas: [-] [N' | Nft] [-] [N] [a/b] ["|in]
  m = s.match(/^(-)?\s*(?:(\d*\.?\d+)\s*(?:'|ft|feet)\s*-?\s*)?(?:(\d*\.?\d+)?\s*(?:(\d+)\/(\d+))?\s*("|in|inch|inches)?)?$/);
  if (m) {
    const [, neg, ft, inch, fn, fd, inMark] = m;
    const hasIn = inch !== undefined || fn !== undefined;
    if (ft === undefined && !hasIn) return NaN;
    // un número sin marcas: metros en métrico, pies en imperial
    if (ft === undefined && !inMark && fn === undefined) {
      if (!/^-?\d*\.?\d+$/.test(s)) return NaN;
      return parseFloat(s) * (u === "imperial" ? FT : 1);
    }
    let v = (ft ? parseFloat(ft) * 12 : 0) + (inch ? parseFloat(inch) : 0) + (fn ? parseFloat(fn) / parseFloat(fd) : 0);
    if (fn && !fd) return NaN;
    v *= IN;
    return neg ? -v : v;
  }
  return NaN;
}

/** Escalas de arquitectura de EE.UU.: denominador y rótulo. */
export const US_SCALES: { den: number; label: string }[] = [
  { den: 12, label: '1" = 1\'-0"' },
  { den: 16, label: '3/4" = 1\'-0"' },
  { den: 24, label: '1/2" = 1\'-0"' },
  { den: 32, label: '3/8" = 1\'-0"' },
  { den: 48, label: '1/4" = 1\'-0"' },
  { den: 64, label: '3/16" = 1\'-0"' },
  { den: 96, label: '1/8" = 1\'-0"' },
  { den: 120, label: '1" = 10\'-0"' },
  { den: 128, label: '3/32" = 1\'-0"' },
  { den: 192, label: '1/16" = 1\'-0"' },
  { den: 240, label: '1" = 20\'-0"' },
  { den: 360, label: '1" = 30\'-0"' },
  { den: 384, label: '1/32" = 1\'-0"' },
  { den: 480, label: '1" = 40\'-0"' },
];
export const METRIC_SCALES = [20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000];
export const scalesFor = (u = current) => (u === "imperial" ? US_SCALES.map((s) => s.den) : METRIC_SCALES);
export const scaleLabel = (den: number, u = current) =>
  u === "imperial" ? US_SCALES.find((s) => s.den === den)?.label ?? `1:${den}` : `1:${den}`;

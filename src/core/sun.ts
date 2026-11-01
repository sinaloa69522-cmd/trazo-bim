// Posición del sol para el estudio de asoleamiento (fórmulas de la NOAA simplificadas, con la ecuación del tiempo).
// La planta tiene el norte arriba: el este es +x y el norte es −y.

const R = Math.PI / 180;

/** Día del año (1..366) de una fecha. */
export function dayOfYear(month: number, day: number) {
  const dm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return dm[Math.max(0, Math.min(11, month - 1))] + day;
}

/**
 * Altura sobre el horizonte y acimut (desde el norte, en el sentido de las agujas) del sol, en grados.
 * hour es la hora solar (12 = mediodía solar, el sol al sur o al norte).
 */
export function sunPosition(lat: number, doy: number, hour: number) {
  const g = (2 * Math.PI / 365) * (doy - 1 + (hour - 12) / 24);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const H = (hour - 12) * 15 * R, phi = lat * R;
  const sinAlt = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  // acimut desde el norte, hacia el este
  const az = Math.atan2(-Math.sin(H) * Math.cos(decl), Math.cos(phi) * Math.sin(decl) - Math.sin(phi) * Math.cos(decl) * Math.cos(H));
  return { alt: alt / R, az: ((az / R) + 360) % 360, decl: decl / R };
}

/** Horas solares de salida y puesta del sol (null si es de día o de noche todo el día). */
export function sunriseSunset(lat: number, doy: number): { rise: number; set: number } | null {
  const { decl } = sunPosition(lat, doy, 12);
  const c = -Math.tan(lat * R) * Math.tan(decl * R);
  if (c <= -1 || c >= 1) return null;
  const h = Math.acos(c) / R / 15;
  return { rise: 12 - h, set: 12 + h };
}

/** Dirección hacia el sol en coordenadas de planta (x este, y sur) y altura z. */
export function sunVector(alt: number, az: number) {
  const a = alt * R, z = az * R;
  return { x: Math.cos(a) * Math.sin(z), y: -Math.cos(a) * Math.cos(z), z: Math.sin(a) };
}

/** Rumbo en palabras (N, NE, E…) de un acimut. */
export function compass(az: number) {
  return ["N", "NE", "E", "SE", "S", "SO", "O", "NO"][Math.round(az / 45) % 8];
}

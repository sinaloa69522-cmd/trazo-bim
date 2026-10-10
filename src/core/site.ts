// Croquis de localización: ubicación del predio y cuentas del mapa de teselas (OpenStreetMap, proyección web Mercator).

export interface Site {
  lat: number;
  lon: number;
  /** Zoom del mapa de teselas (14 a 19) */
  zoom: number;
  /** Dirección escrita por el usuario o encontrada al buscar */
  address?: string;
  /** Croquis propio (imagen subida), clave del almacén de imágenes; manda sobre el mapa */
  img?: string;
}

export const SITE_ZOOM = { min: 14, max: 19, def: 17 };
/** Tamaño de una tesela en la lámina, en mm (unos 160 ppp al imprimir). */
export const TILE_MM = 40;
export const TILE_URL = (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
export const OSM_ATTRIB = "© colaboradores de OpenStreetMap";

const clampZoom = (z: number) => Math.max(SITE_ZOOM.min, Math.min(SITE_ZOOM.max, Math.round(z)));
const valid = (lat: number, lon: number) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 85 && Math.abs(lon) <= 180;

/**
 * Lee coordenadas escritas a mano o pegadas de un enlace de mapas:
 * "19.4326, -99.1332", "19.4326 -99.1332", enlaces de Google Maps con @lat,lon,17z o ?q=lat,lon,
 * y grados, minutos y segundos (19°25'57.4"N 99°07'59.5"W).
 */
export function parseLatLon(text: string): { lat: number; lon: number; zoom?: number } | null {
  const s = text.trim();
  const at = s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?)z)?/);
  if (at) {
    const lat = +at[1], lon = +at[2];
    return valid(lat, lon) ? { lat, lon, ...(at[3] ? { zoom: clampZoom(+at[3]) } : {}) } : null;
  }
  const q = s.match(/[?&](?:q|query|ll|center)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i);
  if (q) { const lat = +q[1], lon = +q[2]; return valid(lat, lon) ? { lat, lon } : null; }
  const dms = [...s.matchAll(/(\d+(?:\.\d+)?)\s*°\s*(?:(\d+(?:\.\d+)?)\s*['′]\s*)?(?:(\d+(?:\.\d+)?)\s*(?:"|″|'')\s*)?([NSEWO])/gi)];
  if (dms.length === 2) {
    let lat = NaN, lon = NaN;
    for (const m of dms) {
      const v = +m[1] + (+(m[2] ?? 0)) / 60 + (+(m[3] ?? 0)) / 3600, h = m[4].toUpperCase();
      if (h === "N" || h === "S") lat = h === "S" ? -v : v; else lon = h === "W" || h === "O" ? -v : v;
    }
    return valid(lat, lon) ? { lat, lon } : null;
  }
  const plain = s.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (plain) { const lat = +plain[1], lon = +plain[2]; return valid(lat, lon) ? { lat, lon } : null; }
  return null;
}

/** Posición en píxeles globales del mapa de teselas (256 px por tesela) a un zoom dado. */
export function project(lat: number, lon: number, z: number) {
  const n = 256 * 2 ** z, r = (lat * Math.PI) / 180;
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n };
}

/** Metros sobre el terreno por cada mm de la lámina. */
export function metersPerMm(lat: number, z: number) {
  return ((156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z) * (256 / TILE_MM);
}

/**
 * Teselas que cubren un recuadro de w × h mm centrado en el predio.
 * dx, dy: posición de la esquina de cada tesela respecto al centro del recuadro, en mm.
 */
export function siteTiles(s: Pick<Site, "lat" | "lon" | "zoom">, w: number, h: number) {
  const z = Math.max(3, Math.min(SITE_ZOOM.max, Math.round(s.zoom))), c = project(s.lat, s.lon, z), k = TILE_MM / 256, n = 2 ** z;
  const cx = c.x * k, cy = c.y * k;
  const out: { x: number; y: number; z: number; dx: number; dy: number }[] = [];
  for (let ty = Math.floor((cy - h / 2) / TILE_MM); ty <= Math.floor((cy + h / 2) / TILE_MM); ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = Math.floor((cx - w / 2) / TILE_MM); tx <= Math.floor((cx + w / 2) / TILE_MM); tx++) {
      out.push({ x: ((tx % n) + n) % n, y: ty, z, dx: tx * TILE_MM - cx, dy: ty * TILE_MM - cy });
    }
  }
  return out;
}

/** Barra de escala: la longitud redonda más larga que cabe en maxMm. */
export function scaleBar(lat: number, z: number, maxMm = 22) {
  const mpm = metersPerMm(lat, z), max = mpm * maxMm;
  const nice = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].filter((v) => v <= max).pop() ?? 10;
  return { m: nice, mm: nice / mpm, label: nice >= 1000 ? `${nice / 1000} km` : `${nice} m` };
}

export const fmtLatLon = (s: Pick<Site, "lat" | "lon">) =>
  `${Math.abs(s.lat).toFixed(5)}° ${s.lat >= 0 ? "N" : "S"}, ${Math.abs(s.lon).toFixed(5)}° ${s.lon >= 0 ? "E" : "O"}`;

/** Busca una dirección con Nominatim (OpenStreetMap). Devuelve null si no la encuentra o no hay red. */
export async function geocode(q: string, f: typeof fetch = fetch): Promise<{ lat: number; lon: number; label: string } | null> {
  const r = await f(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=es&q=${encodeURIComponent(q)}`);
  if (!r.ok) return null;
  const j = (await r.json()) as { lat: string; lon: string; display_name: string }[];
  if (!j.length) return null;
  return { lat: +j[0].lat, lon: +j[0].lon, label: j[0].display_name };
}

/** Inversa de project: latitud y longitud de un punto en píxeles globales al zoom z. */
export function unproject(x: number, y: number, z: number) {
  const n = 256 * 2 ** z, lon = (x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return { lat, lon };
}

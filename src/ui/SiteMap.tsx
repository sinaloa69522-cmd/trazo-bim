// Croquis de localización de la portada: mapa de OpenStreetMap centrado en el predio,
// o la imagen que haya subido el usuario. Sin red, un croquis esquemático con las coordenadas.
import { useEffect, useState } from "react";
import { fmtLatLon, geocode, OSM_ATTRIB, parseLatLon, project, scaleBar, SITE_ZOOM, siteTiles, TILE_MM, TILE_URL, unproject, type Site } from "../core/site";
import type { Editor } from "../editor/Editor";

/** Ancho máximo que se cubre de teselas; el recuadro recorta lo que sobra. */
const COVER_W = 140;

export function SiteMap({ ed, h, en = false, empty, dz = 0 }: { ed: Editor; h: number; en?: boolean; empty: string; dz?: number }) {
  const raw = ed.project.info.site, site = raw && dz ? { ...raw, img: undefined, zoom: Math.max(3, raw.zoom + dz) } : raw;
  const img = site?.img ? ed.images.get(site.img) : undefined;
  const located = !!site && !(site.lat === 0 && site.lon === 0);
  const [failed, setFailed] = useState(false);
  const key = located ? `${site!.lat},${site!.lon},${site!.zoom}` : "";
  useEffect(() => setFailed(false), [key]);

  if (img) return (
    <figure className="pc-site">
      <div className="pc-map has" style={{ height: `${h}mm` }}><img className="pc-own" src={img} alt={en ? "Vicinity map" : "Croquis de localización"} /></div>
      {site?.address && <figcaption>{site.address}</figcaption>}
    </figure>
  );
  if (!located) return <div className="pc-map" style={{ height: `${h}mm` }}>{empty}</div>;
  const s = site!, bar = scaleBar(s.lat, s.zoom);
  return (
    <figure className="pc-site">
      <div className="pc-map has" style={{ height: `${h}mm` }}>
        {failed ? (
          <svg className="pc-sketch" viewBox="0 0 100 40" preserveAspectRatio="xMidYMid slice" aria-hidden>
            <path d="M0 13h100M0 29h100M18 0v40M37 0v40M55 0v40M73 0v40M91 0v40" stroke="#bbb" strokeWidth={2.4} />
          </svg>
        ) : siteTiles(s, COVER_W, h).map((t) => (
          <img key={`${t.z}/${t.x}/${t.y}/${t.dx}`} className="pc-tile" alt=""
            src={TILE_URL(t.z, t.x, t.y)} onError={() => setFailed(true)}
            style={{ left: `calc(50% + ${t.dx}mm)`, top: `calc(50% + ${t.dy}mm)`, width: `${TILE_MM}mm`, height: `${TILE_MM}mm` }} />
        ))}
        {/* predio */}
        <svg className="pc-pin" viewBox="-6 -14 12 15" aria-hidden><path d="M0 0C-1-3.5-5-5.5-5-9a5 5 0 0 1 10 0c0 3.5-4 5.5-5 9z" fill="#c62828" stroke="#fff" strokeWidth={0.8} /><circle cy={-9} r={1.8} fill="#fff" /></svg>
        {/* norte */}
        <svg className="pc-north" viewBox="-5 -7 10 13" aria-hidden><circle r={4.4} fill="#fff" fillOpacity={0.85} stroke="#111" strokeWidth={0.4} /><path d="M0-3.8L1.7 2.6 0 1.5-1.7 2.6z" fill="#111" /><text y={-4.6} textAnchor="middle" fontSize={2.6} fontWeight={700}>N</text></svg>
        <div className="pc-scale"><span style={{ width: `${bar.mm}mm` }} />{bar.label}</div>
        {failed ? <div className="pc-offline">{en ? "Map unavailable offline: upload an image" : "Mapa sin conexión: sube una imagen del croquis"}</div>
          : <div className="pc-attrib">{en ? "© OpenStreetMap contributors" : OSM_ATTRIB}</div>}
      </div>
      <figcaption>{s.address ? `${s.address} · ` : ""}{fmtLatLon(s)}</figcaption>
    </figure>
  );
}

/** Panel para situar el predio: buscar, mi ubicación, clic en el mapa para afinar, zoom e imagen propia. */
export function SiteEditor({ ed, onClose }: { ed: Editor; onClose: () => void }) {
  const site = ed.project.info.site, located = !!site && !(site.lat === 0 && site.lon === 0);
  const [q, setQ] = useState(site?.address ?? "");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const W = 300, H = 190;

  const search = async () => {
    const t = q.trim();
    if (!t) return;
    const c = parseLatLon(t);
    if (c) { ed.setSite({ lat: c.lat, lon: c.lon, ...(c.zoom ? { zoom: c.zoom } : {}), address: site?.address }); setMsg("Coordenadas puestas. Haz clic en el mapa para afinar."); return; }
    setBusy(true); setMsg("Buscando…");
    try {
      const r = await geocode(t);
      if (r) { ed.setSite({ lat: r.lat, lon: r.lon, zoom: SITE_ZOOM.def, address: t }); setMsg(`Encontrado: ${r.label}`); }
      else setMsg("No se encontró esa dirección. Prueba con calle, colonia y ciudad, o pega coordenadas o un enlace de Google Maps.");
    } catch {
      setMsg("No hay conexión con el buscador. Pega las coordenadas o el enlace de Google Maps del predio.");
    } finally { setBusy(false); }
  };
  const here = () => {
    if (!navigator.geolocation) { setMsg("Este navegador no da la ubicación."); return; }
    setBusy(true); setMsg("Obteniendo tu ubicación…");
    navigator.geolocation.getCurrentPosition(
      (p) => { setBusy(false); ed.setSite({ lat: p.coords.latitude, lon: p.coords.longitude, zoom: 18 }); setMsg(`Ubicación tomada (±${Math.round(p.coords.accuracy)} m). Haz clic en el mapa para afinar.`); },
      () => { setBusy(false); setMsg("No se pudo leer tu ubicación: permite el acceso en el navegador, o escribe la dirección."); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };
  const upload = (f: File | undefined) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { ed.setSiteImage(String(r.result)); setMsg("Imagen puesta como croquis."); };
    r.readAsDataURL(f);
  };
  const zoom = (d: number) => site && ed.setSite({ zoom: Math.max(SITE_ZOOM.min, Math.min(SITE_ZOOM.max, site.zoom + d)) });
  const recenter = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!located) return;
    const b = e.currentTarget.getBoundingClientRect(), c = project(site!.lat, site!.lon, site!.zoom);
    const p = unproject(c.x + (e.clientX - b.left - W / 2), c.y + (e.clientY - b.top - H / 2), site!.zoom);
    ed.setSite({ lat: +p.lat.toFixed(6), lon: +p.lon.toFixed(6) });
  };

  return (
    <div className="siteed" role="dialog" aria-label="Ubicación del predio">
      <div className="se-row">
        <input value={q} placeholder="Dirección, coordenadas o enlace de Google Maps" onChange={(e) => setQ(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === "Enter") search(); }} />
        <button className="btn primary" onClick={search} disabled={busy}>Buscar</button>
      </div>
      <div className="se-row">
        <button className="btn" onClick={here} disabled={busy}>Usar mi ubicación</button>
        <button className="btn" onClick={() => zoom(-1)} disabled={!located} aria-label="Alejar el mapa">−</button>
        <button className="btn" onClick={() => zoom(1)} disabled={!located} aria-label="Acercar el mapa">+</button>
        <label className="btn se-up">Subir imagen<input type="file" accept="image/*" onChange={(e) => upload(e.currentTarget.files?.[0])} /></label>
      </div>
      <div className="se-map" style={{ width: W, height: H }} onClick={recenter} title={located ? "Clic para mover el predio a ese punto" : undefined}>
        {located ? <>
          {previewTiles(site!, W, H).map((t) => <img key={`${t.z}/${t.x}/${t.y}/${t.left}`} src={TILE_URL(t.z, t.x, t.y)} alt="" draggable={false} style={{ left: t.left, top: t.top }} />)}
          <span className="se-pin" />
        </> : <p>Busca la dirección o usa tu ubicación para ver el mapa aquí.</p>}
      </div>
      {located && <p className="se-coords">{fmtLatLon(site!)} · zoom {site!.zoom}</p>}
      <label className="se-addr">Texto bajo el croquis
        <input key={site?.address ?? ""} defaultValue={site?.address ?? ""} placeholder="Calle, número, colonia, municipio"
          onBlur={(e) => { const v = e.currentTarget.value.trim(); if (v !== (site?.address ?? "")) ed.setSite({ address: v || undefined }); }} />
      </label>
      {msg && <p className="se-msg">{msg}</p>}
      <div className="se-row">
        {site?.img && <button className="btn" onClick={() => ed.setSiteImage(null)}>Quitar imagen</button>}
        {site && <button className="btn" onClick={() => { ed.setSite(null); setMsg(""); }}>Quitar ubicación</button>}
        <button className="btn" style={{ marginLeft: "auto" }} onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}

/** Teselas del mapa de vista previa, en píxeles respecto a su esquina. */
function previewTiles(s: Pick<Site, "lat" | "lon" | "zoom">, w: number, h: number) {
  const c = project(s.lat, s.lon, s.zoom), n = 2 ** s.zoom, x0 = c.x - w / 2, y0 = c.y - h / 2;
  const out: { x: number; y: number; z: number; left: number; top: number }[] = [];
  for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + h) / 256); ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + w) / 256); tx++) out.push({ x: ((tx % n) + n) % n, y: ty, z: s.zoom, left: tx * 256 - x0, top: ty * 256 - y0 });
  }
  return out;
}

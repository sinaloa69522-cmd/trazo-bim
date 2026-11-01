import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type MouseEvent as RMouse, type PointerEvent as RPointer } from "react";
import type { Editor } from "../editor/Editor";
import { Viewer3D } from "../editor/Viewer3D";
import { compass, dayOfYear, sunPosition, sunriseSunset } from "../core/sun";

export interface View3DHandle { fit(): void; snapshot(width?: number): Blob | null; walk(): void }

export const View3D = forwardRef<View3DHandle, { ed: Editor; realistic: boolean; sun?: boolean; onCloseSun?: () => void }>(function View3D({ ed, realistic, sun, onCloseSun }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer3D | null>(null);
  const [failed, setFailed] = useState(false);
  const [walking, setWalking] = useState(false);

  useImperativeHandle(ref, () => ({ fit: () => viewer.current?.fit(), snapshot: (w?: number) => viewer.current?.snapshot(w) ?? null, walk: () => viewer.current?.startWalk() }), []);

  useEffect(() => {
    try {
      const bg = () => getComputedStyle(document.documentElement).getPropertyValue("--view-bg").trim();
      viewer.current = new Viewer3D(host.current!, ed, bg);
      viewer.current.setRealistic(realistic);
      viewer.current.onWalk = setWalking;
    } catch {
      setFailed(true);
    }
    return () => { viewer.current?.dispose(); viewer.current = null; };
  }, [ed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => viewer.current?.setRealistic(realistic), [realistic]);

  return (
    <div id="view3d" ref={host}>
      {sun && <SunPanel ed={ed} v={viewer.current} onClose={onCloseSun} />}
      {walking && <WalkPad v={viewer.current} />}
      {failed && <div className="msg3d">Este navegador no pudo iniciar WebGL. La planta sigue funcionando.</div>}
    </div>
  );
});

/** Ayuda y botones del recorrido: mantener pulsado para caminar o girar (sirve en táctil). */
function WalkPad({ v }: { v: Viewer3D | null }) {
  const hold = (f: number, s: number, t: number) => ({
    onPointerDown: (e: RPointer) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture(e.pointerId); v?.walkHold(f, s, t); },
    onPointerUp: () => v?.walkHold(0, 0, 0),
    onPointerCancel: () => v?.walkHold(0, 0, 0),
    onContextMenu: (e: RMouse) => e.preventDefault(),
  });
  return (
    <>
      <div className="walkhelp">Recorrido · <b>W A S D</b> o flechas para caminar · arrastra para mirar · <b>Mayús</b> corre · <b>Esc</b> sale</div>
      <div className="walkpad" aria-label="Caminar">
        <button className="btn" title="Girar a la izquierda" {...hold(0, 0, -1)}>⟲</button>
        <button className="btn" title="Avanzar" {...hold(1, 0, 0)}>▲</button>
        <button className="btn" title="Girar a la derecha" {...hold(0, 0, 1)}>⟳</button>
        <button className="btn" title="Paso a la izquierda" {...hold(0, -1, 0)}>◀</button>
        <button className="btn" title="Retroceder" {...hold(-1, 0, 0)}>▼</button>
        <button className="btn" title="Paso a la derecha" {...hold(0, 1, 0)}>▶</button>
      </div>
      <button className="btn walkexit" onClick={() => v?.stopWalk()}>Salir del recorrido</button>
    </>
  );
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const hhmm = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60) % 60).padStart(2, "0")}`;
type SunState = { lat: number; month: number; day: number; hour: number };

function loadSun(ed: Editor): SunState {
  try { const s = JSON.parse(localStorage.getItem("trazo-sol") ?? ""); if (typeof s?.hour === "number") return { ...s, lat: ed.project.info.site?.lat ?? s.lat }; } catch { /* sin guardar */ }
  return { lat: ed.project.info.site?.lat ?? 19.43, month: 6, day: 21, hour: 10 };
}

/** Estudio de asoleamiento: latitud, fecha y hora solar mueven el sol y las sombras del 3D. */
function SunPanel({ ed, v, onClose }: { ed: Editor; v: Viewer3D | null; onClose?: () => void }) {
  const [st, setSt] = useState<SunState>(() => loadSun(ed));
  const [play, setPlay] = useState(false);
  const doy = dayOfYear(st.month, st.day), pos = sunPosition(st.lat, doy, st.hour), rs = sunriseSunset(st.lat, doy);
  useEffect(() => {
    v?.setSunStudy({ alt: pos.alt, az: pos.az });
    try { localStorage.setItem("trazo-sol", JSON.stringify(st)); } catch { /* sin almacenamiento */ }
  }, [v, pos.alt, pos.az, st]);
  useEffect(() => () => v?.setSunStudy(null), [v]);
  useEffect(() => {
    if (!play) return;
    const id = setInterval(() => setSt((s) => {
      const r = sunriseSunset(s.lat, dayOfYear(s.month, s.day)), a = r ? r.rise : 5, b = r ? r.set : 19;
      return { ...s, hour: s.hour + 0.25 > b ? a : Math.max(a, s.hour + 0.25) };
    }), 250);
    return () => clearInterval(id);
  }, [play]);
  const set = (p: Partial<SunState>) => setSt((s) => ({ ...s, ...p }));
  const preset = (month: number, day: number) => set({ month, day });
  return (
    <div className="sunpanel" onPointerDown={(e) => e.stopPropagation()}>
      <div className="sunhead"><b>Estudio de sol</b><button className="btn" onClick={onClose} title="Cerrar y volver al sol normal">×</button></div>
      <label>Latitud <input type="number" step="0.01" min={-66} max={66} value={st.lat} onChange={(e) => set({ lat: Math.max(-66, Math.min(66, +e.target.value || 0)) })} />°{ed.project.info.site ? " (del croquis)" : ""}</label>
      <div className="sunrow">
        <label>Fecha <select value={st.month} onChange={(e) => set({ month: +e.target.value })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>
        <input type="number" min={1} max={31} value={st.day} onChange={(e) => set({ day: Math.max(1, Math.min(31, +e.target.value || 1)) })} style={{ width: 52 }} />
        <button className="btn" onClick={() => preset(3, 20)} title="Equinoccio de primavera">21 mar</button>
        <button className="btn" onClick={() => preset(6, 21)} title="Solsticio de verano: el día más largo">21 jun</button>
        <button className="btn" onClick={() => preset(12, 21)} title="Solsticio de invierno: las sombras más largas">21 dic</button>
      </div>
      <label className="sunhour">Hora solar <b>{hhmm(st.hour)}</b>
        <input type="range" min={4} max={20} step={0.25} value={st.hour} onChange={(e) => set({ hour: +e.target.value })} />
      </label>
      <div className="sunrow">
        <button className={`btn${play ? " on" : ""}`} onClick={() => setPlay(!play)}>{play ? "Pausa" : "Animar el día"}</button>
        <span className="sunread">{pos.alt > 0 ? `Altura ${pos.alt.toFixed(0)}° · ${compass(pos.az)} ${pos.az.toFixed(0)}°` : "De noche (sol bajo el horizonte)"}</span>
      </div>
      <small>{rs ? `Sale ${hhmm(rs.rise)} · se pone ${hhmm(rs.set)} · ${(rs.set - rs.rise).toFixed(1)} h de sol` : "Sin salida ni puesta ese día"}. Norte arriba en la planta.</small>
    </div>
  );
}

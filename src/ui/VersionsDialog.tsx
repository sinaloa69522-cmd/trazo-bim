import { useEffect, useRef, useState } from "react";
import { summarize, type Version } from "../core/versions";
import type { Editor } from "../editor/Editor";
import { saveFile } from "./saveFile";

const when = (iso: string) => new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const sum = (s: Version["summary"]) => `${s.levels} nivel${s.levels > 1 ? "es" : ""} · ${s.walls} muros · ${s.openings} vanos · ${s.area.toFixed(1)} m²`;

/** Historial de versiones con nombre: guardar la actual, volver a una anterior, descargarla o borrarla. */
export function VersionsDialog({ ed, onClose }: { ed: Editor; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [list, setList] = useState(() => ed.versions);
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  const refresh = () => setList(ed.versions);
  const save = () => { if (ed.saveVersion(name || `Versión ${list.length + 1}`)) { setName(""); refresh(); } };
  return (
    <dialog ref={ref} onClose={onClose} className="verdlg">
      <h3>Historial de versiones</h3>
      <p className="hint">Guarda el proyecto con un nombre (por ejemplo «Anteproyecto» o «Cambios del cliente») y vuelve a cualquiera cuando quieras. Al restaurar, lo que tenías queda guardado como otra versión. Se guardan en este navegador; descarga la que quieras conservar fuera.</p>
      <div className="vernew">
        <input type="text" placeholder={`Versión ${list.length + 1}`} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }} aria-label="Nombre de la versión" />
        <button className="btn primary" onClick={save}>Guardar versión actual</button>
      </div>
      <p className="vercur">Ahora: {sum(summarize(ed.project))}</p>
      {list.length ? <ul className="verlist">
        {list.map((v) => (
          <li key={v.id}>
            <div className="vermeta">
              <input type="text" defaultValue={v.name} aria-label="Nombre" onBlur={(e) => { if (e.target.value.trim() && e.target.value !== v.name) { ed.renameVersion(v.id, e.target.value); refresh(); } }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
              <small>{when(v.at)} · {sum(v.summary)}</small>
            </div>
            <div className="veracts">
              <button className="btn" onClick={() => { ed.restoreVersion(v.id); ref.current?.close(); }}>Restaurar</button>
              <button className="btn" onClick={() => { const f = ed.versionFile(v.id); if (f) void saveFile(f.name, f.text, "application/json"); }} title="Descargar esta versión como archivo .trazo">Descargar</button>
              {confirm === v.id
                ? <button className="btn danger" onClick={() => { ed.deleteVersion(v.id); setConfirm(null); refresh(); }}>¿Borrar?</button>
                : <button className="btn" onClick={() => setConfirm(v.id)} title="Borrar esta versión">Borrar</button>}
            </div>
          </li>
        ))}
      </ul> : <p className="empty">Todavía no hay versiones guardadas.</p>}
      <div className="acts"><span>{list.length} de 40 versiones</span><button className="btn" onClick={() => ref.current?.close()}>Cerrar</button></div>
    </dialog>
  );
}

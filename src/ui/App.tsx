import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Editor, type Tool } from "../editor/Editor";
import { CommandLine } from "./CommandLine";
import { ExportDialog, type ExportFormat } from "./ExportDialog";
import { PlanView } from "./PlanView";
import { SheetView } from "./SheetView";
import { Sidebar } from "./Sidebar";
import { View3D, type View3DHandle } from "./View3D";

type ViewMode = "plan" | "split" | "3d" | "sheet";

const TOOLS: { tool: Tool; label: string; key: string; icon: JSX.Element }[] = [
  { tool: "select", label: "Seleccionar", key: "S", icon: <path d="M3 2l9 5-4 1.2L6.5 13z" /> },
  { tool: "wall", label: "Muro", key: "M", icon: <rect x="1.5" y="6" width="13" height="4" /> },
  { tool: "door", label: "Puerta", key: "P", icon: <path d="M2 13h12M4 13V4M4 4a9 9 0 0 1 9 9" /> },
  { tool: "window", label: "Ventana", key: "V", icon: <><rect x="1.5" y="5.5" width="13" height="5" /><path d="M1.5 8h13" /></> },
  { tool: "line", label: "Línea", key: "L", icon: <path d="M2 14L14 2" /> },
  { tool: "dim", label: "Cota", key: "C", icon: <path d="M2 4v6M14 4v6M2 8h12M4 9.5l-2-1.5 2-1.5M12 6.5l2 1.5-2 1.5" /> },
  { tool: "room", label: "Habitación", key: "H", icon: <><rect x="2" y="2" width="12" height="12" /><path d="M5 7h6M5 10h4" /></> },
  { tool: "slab", label: "Losa", key: "LO", icon: <path d="M2 6l6-3 6 3-6 3zM2 6v3l6 3 6-3V6" /> },
  { tool: "hole", label: "Hueco en losa", key: "HL", icon: <><path d="M2 5l6-3 6 3-6 3z" /><path d="M6 4.5l4 1.5M10 4.5l-4 1.5" /><path d="M2 5v3l6 3 6-3V5" /></> },
  { tool: "roof", label: "Cubierta", key: "CU", icon: <path d="M1.5 9L8 3.5 14.5 9M3.5 7.5V13h9V7.5" /> },
  { tool: "stair", label: "Escalera", key: "ES", icon: <path d="M2 14h3v-3h3V8h3V5h3V2" /> },
  { tool: "furniture", label: "Mobiliario", key: "MB", icon: <path d="M4 2v12M4 8h8v6M12 8V5M2 14h2" /> },
  { tool: "section", label: "Sección", key: "SE", icon: <path d="M2 8h12M2 8v-4M14 8V4M2 4l-1 2M2 4l1 2M14 4l-1 2M14 4l1 2" strokeDasharray="0" /> },
  { tool: "text", label: "Texto", key: "TX", icon: <path d="M3 3h10M8 3v10M6 13h4" /> },
  { tool: "trim", label: "Recortar", key: "TR", icon: <><path d="M2 8h12M8 2v12" /><path d="M10.5 5.5l3-3" strokeDasharray="1.5 1.5" /></> },
  { tool: "extend", label: "Alargar", key: "AL", icon: <><path d="M13 2v12M2 8h7" /><path d="M9 8h4" strokeDasharray="1.5 1.5" /><path d="M7.5 6.5L9.5 8l-2 1.5" /></> },
  { tool: "offset", label: "Desfase", key: "DE", icon: <path d="M2 5h12M2 11h12" /> },
];

function storage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

export function useEditorVersion(ed: Editor) {
  return useSyncExternalStore(ed.subscribe, ed.getVersion);
}

export function App() {
  const ed = useMemo(() => new Editor(storage()), []);
  useEditorVersion(ed);
  const [view, setView] = useState<ViewMode>(() => {
    try { return (localStorage.getItem("trazo-view") as ViewMode) || (innerWidth < 760 ? "plan" : "split"); } catch { return "split"; }
  });
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const cmdRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const view3d = useRef<View3DHandle>(null);
  const spaceDown = useRef(false);

  useEffect(() => { try { localStorage.setItem("trazo-view", view); } catch { /* sin almacenamiento */ } }, [view]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement, inField = ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
      if (e.key === "F8") { e.preventDefault(); ed.toggleOrtho(); }
      else if (e.key === "F3") { e.preventDefault(); ed.toggleOsnap(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !inField) { e.preventDefault(); ed.undo(); }
      else if (inField) return;
      else if (e.key === "Escape") ed.escape();
      else if ((e.key === "Delete" || e.key === "Backspace") && ed.sels.length) { e.preventDefault(); ed.deleteSel(); }
      else if (e.key === " ") { spaceDown.current = true; e.preventDefault(); }
      else if (e.key === "Enter") ed.runCommand("");
      else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) cmdRef.current?.focus();
    };
    const up = (e: KeyboardEvent) => { if (e.key === " ") spaceDown.current = false; };
    document.addEventListener("keydown", down);
    document.addEventListener("keyup", up);
    return () => { document.removeEventListener("keydown", down); document.removeEventListener("keyup", up); };
  }, [ed]);

  return (
    <div className="app">
      <header className="top">
        <div className="brand">Trazo BIM <small>v0.2</small></div>
        <div className="group" role="toolbar" aria-label="Herramientas" id="tools">
          {TOOLS.map((t) => (
            <button key={t.tool} className="tb" aria-pressed={ed.tool === t.tool} title={`${t.label} (${t.key})`}
              onClick={() => { ed.setTool(t.tool); cmdRef.current?.focus(); }}>
              <svg viewBox="0 0 16 16">{t.icon}</svg><span className="lbl">{t.label}</span><kbd>{t.key}</kbd>
            </button>
          ))}
        </div>
        <div className="group" role="group" aria-label="Vista">
          {([["plan", "Planta"], ["split", "Dividida"], ["3d", "3D"], ["sheet", "Lámina"]] as const).map(([v, label]) => (
            <button key={v} className="tb" aria-pressed={view === v} onClick={() => setView(v)}>{label}</button>
          ))}
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => ed.undo()} title="Deshacer (Ctrl+Z)">Deshacer</button>
        <button className="btn" onClick={() => { ed.loadSample(); ed.fitRequest?.(); view3d.current?.fit(); }}>Ejemplo</button>
        <button className="btn" onClick={() => ed.clear()}>Nuevo</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>Importar DXF</button>
        <input ref={fileRef} type="file" accept=".dxf" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) { ed.importDxf(await f.text(), f.name); view3d.current?.fit(); }
        }} />
        <div className="group exp" role="group" aria-label="Exportar">
          <span className="glbl">Exportar</span>
          <button className="tb" onClick={() => setExporting("dxf")} title="Planta del nivel activo para AutoCAD">DXF</button>
          <button className="tb" onClick={() => setExporting("ifc")} title="Modelo BIM completo para Revit, ArchiCAD y visores IFC">IFC</button>
        </div>
      </header>

      <div className="main">
        <Sidebar ed={ed} onFocusCommand={() => cmdRef.current?.focus()} />
        <section className="work" data-view={view}>
          <div className="pane paneplan">
            <PlanView ed={ed} spaceDown={spaceDown} />
            <span className="tag">PLANTA · {ed.model.name} · 1:100</span>
          </div>
          {view === "sheet" && <SheetView ed={ed} />}
          <div className="pane pane3d">
            <View3D ref={view3d} ed={ed} />
            <span className="tag">3D · Vista axonométrica</span>
            <div className="paneover"><button className="btn" onClick={() => view3d.current?.fit()}>Encuadrar</button></div>
          </div>
        </section>
      </div>

      <CommandLine ed={ed} inputRef={cmdRef} onExport={setExporting} />
      {exporting && <ExportDialog ed={ed} format={exporting} onClose={() => setExporting(null)} />}
    </div>
  );
}

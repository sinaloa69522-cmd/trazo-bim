import { saveFile } from "./saveFile";
import { useEffect, useMemo, useRef, useState } from "react";
import { toDxf } from "../core/dxf";
import { toIfc } from "../core/ifc";
import type { Editor } from "../editor/Editor";

export type ExportFormat = "dxf" | "ifc";

const FORMATS = {
  dxf: {
    title: "Exportar a DXF",
    hint: "La planta del nivel activo. Se abre en AutoCAD, BricsCAD o LibreCAD, y puede vincularse en Revit. Cada categoría va en su propia capa.",
    file: () => "planta.dxf", mime: "application/dxf",
  },
  ifc: {
    title: "Exportar a IFC",
    hint: "El modelo BIM completo (IFC4): todos los niveles con muros, puertas, ventanas, losas, cubiertas, escaleras y espacios. Se abre en Revit, ArchiCAD, BIMcollab Zoom o cualquier visor IFC.",
    file: (ed: Editor) => `${(ed.project.info.name || "proyecto").replace(/[^\p{L}\p{N}_-]+/gu, "-")}.ifc`, mime: "application/x-step",
  },
} as const;

export function ExportDialog({ ed, format, onClose }: { ed: Editor; format: ExportFormat; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const F = FORMATS[format], file = F.file(ed);
  const text = useMemo(() => (format === "dxf" ? toDxf(ed.model, ed.rooms) : toIfc(ed.project)), [ed, format]);
  const [info, setInfo] = useState(() => {
    if (format === "dxf") return `${(text.match(/\n0\n(LINE|ARC|TEXT)/g) ?? []).length} entidades · unidades: metros`;
    const count = (t: string) => (text.match(new RegExp(`=${t}\\(`, "g")) ?? []).length;
    const nl = ed.project.levels.length;
    return `${nl} nivel${nl > 1 ? "es" : ""} · ${count("IFCWALL")} muros · ${count("IFCDOOR") + count("IFCWINDOW")} puertas y ventanas · metros`;
  });

  useEffect(() => { ref.current?.showModal(); }, []);

  const download = () => {
    void saveFile(file, text, F.mime);
    setInfo(`Descargado como ${file}.`);
  };

  return (
    <dialog ref={ref} onClose={onClose}>
      <h3>{F.title}</h3>
      <p className="hint">{F.hint}</p>
      <textarea readOnly value={text} />
      <div className="acts">
        <span>{info}</span>
        <button className="btn" onClick={() => ref.current?.close()}>Cerrar</button>
        <button className="btn" onClick={() => navigator.clipboard.writeText(text).then(() => setInfo("Copiado al portapapeles."), () => setInfo("No se pudo copiar."))}>Copiar</button>
        <button className="btn primary" onClick={download}>Descargar</button>
      </div>
    </dialog>
  );
}

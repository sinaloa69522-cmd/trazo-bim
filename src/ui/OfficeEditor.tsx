// Datos del despacho para el cajetín: nombre, logo, responsable, cédula, registro D.R.O., contacto y firma.
import { useState } from "react";
import type { Editor } from "../editor/Editor";
import { readMark } from "../editor/fileImport";
import { emptyOffice, savedOffice } from "../core/office";
import type { Office } from "../core/model";

export function OfficeEditor({ ed, onClose }: { ed: Editor; onClose: () => void }) {
  const o: Office = { ...emptyOffice(), ...(ed.project.info.office ?? savedOffice() ?? {}) };
  const [msg, setMsg] = useState("");
  const field = (k: "name" | "responsible" | "license" | "dro" | "contact", label: string, ph: string) => (
    <label key={`${k}-${o[k] ?? ""}`} className="of-f">{label}
      <input type="text" defaultValue={o[k] ?? ""} placeholder={ph}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        onBlur={(e) => { const v = e.target.value.trim(); if (v !== (o[k] ?? "")) ed.setOffice({ [k]: v }); }} />
    </label>
  );
  const img = (k: "logo" | "sign", label: string, hint: string) => (
    <div className="of-img">
      <span>{label}</span>
      <div className="of-prev">{o[k] ? <img src={o[k]} alt={label} /> : <small>{hint}</small>}</div>
      <label className="btn se-up">{o[k] ? "Cambiar" : "Subir imagen"}
        <input type="file" accept="image/*" onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try { ed.setOffice({ [k]: await readMark(f, k === "logo" ? 600 : 700, k === "sign") }); setMsg(""); }
          catch (err) { setMsg(`No se pudo leer la imagen: ${(err as Error).message}`); }
        }} />
      </label>
      {o[k] && <button className="btn" onClick={() => ed.setOffice({ [k]: undefined })}>Quitar</button>}
    </div>
  );
  return (
    <div className="siteed offed" role="dialog" aria-label="Datos del despacho">
      <div className="se-row"><strong>Datos del despacho</strong><span style={{ flex: 1 }} /><button className="btn" onClick={onClose}>Cerrar</button></div>
      {field("name", "Despacho", "p. ej. Taller de Arquitectura Ruiz")}
      {field("responsible", "Responsable del proyecto", "p. ej. Arq. Ana Ruiz Pérez")}
      <div className="se-row">
        {field("license", "Cédula profesional", "1234567")}
        {field("dro", "Registro D.R.O. (opcional)", "DRO-0000")}
      </div>
      {field("contact", "Contacto (opcional)", "Tel. 55 1234 5678 · ana@despacho.mx")}
      {img("logo", "Logo", "PNG o JPG")}
      {img("sign", "Firma", "Foto o escaneo en papel blanco: el fondo se quita solo")}
      {msg && <p className="se-msg">{msg}</p>}
      <p className="se-msg">Sale en el cajetín de todas las láminas, en la memoria descriptiva y en la presentación. Queda guardado en el proyecto y en este navegador para tus proyectos nuevos.</p>
    </div>
  );
}

/** Encabezado del cajetín con el logo y el nombre del despacho. */
export function OfficeHead({ o }: { o: Office }) {
  if (!o.logo && !o.name) return null;
  return (
    <div className="c-office">
      {o.logo && <img src={o.logo} alt="" />}
      <div>{o.name && <b>{o.name}</b>}{o.contact && <small className="c-contact">{o.contact}</small>}</div>
    </div>
  );
}

/** Fila del cajetín con el responsable, su cédula (y D.R.O.) y su firma. */
export function OfficeSign({ o, en }: { o: Office; en: boolean }) {
  if (!o.responsible && !o.license && !o.sign) return null;
  return (
    <div className="c-row c-sign">
      <div>
        <small>{en ? "Responsible" : "Responsable"}</small>{o.responsible || "—"}
        {(o.license || o.dro) && <span className="c-lic">{[o.license && `${en ? "Lic." : "Céd. prof."} ${o.license}`, o.dro && `D.R.O. ${o.dro}`].filter(Boolean).join(" · ")}</span>}
      </div>
      <div className="c-firma"><small>{en ? "Signature" : "Firma"}</small>{o.sign ? <img src={o.sign} alt="" /> : <span className="c-line" />}</div>
    </div>
  );
}

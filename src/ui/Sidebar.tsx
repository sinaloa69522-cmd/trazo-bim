import { Fragment, useState } from "react";
import { dimGeom, dir, fits } from "../core/geometry";
import { LAYERS, type Model } from "../core/model";
import type { Editor } from "../editor/Editor";

const num = (v: number) => v.toFixed(2);

function NumberField({ id, label, value, onCommit }: { id: string; label: string; value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" step="0.01" min="0.01" value={draft ?? num(value)}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        onBlur={(e) => { const v = parseFloat(e.target.value); setDraft(null); if (v > 0 && v !== value) onCommit(v); }} />
    </>
  );
}

function Properties({ ed, onFocusCommand }: { ed: Editor; onFocusCommand: () => void }) {
  const sel = ed.sel, o = ed.selObj(), d = ed.defaults;
  const ro: [string, string][] = [];
  let title = "Valores por defecto", body: JSX.Element | null = null;
  const n = ed.sels.length;
  const key = sel ? `${sel.type}-${sel.id}` : n > 1 ? "multi" : "def";
  const TYPE_LABEL = { wall: "Muros", opening: "Puertas y ventanas", line: "Líneas", dim: "Cotas", room: "Habitaciones" } as const;

  if (sel && o && sel.type === "wall") {
    const w = o as Model["walls"][number];
    title = "Muro básico";
    ro.push(["Longitud", `${num(dir(w).L)} m`], ["Área de muro", `${num(dir(w).L * w.height)} m²`]);
    body = <>
      <NumberField id={`${key}-t`} label="Espesor (m)" value={w.thick} onCommit={(v) => ed.edit(() => { w.thick = v; })} />
      <NumberField id={`${key}-h`} label="Altura (m)" value={w.height} onCommit={(v) => ed.edit(() => { w.height = v; })} />
    </>;
  } else if (sel && o && sel.type === "opening") {
    const op = o as Model["openings"][number], w = ed.wallById(op.wallId)!;
    title = op.kind === "door" ? "Puerta de una hoja" : "Ventana fija";
    body = <>
      <NumberField id={`${key}-w`} label="Ancho (m)" value={op.width} onCommit={(v) => {
        if (fits(ed.model, w, op.t, v, op.id)) ed.edit(() => { op.width = v; }); else ed.log("Ese ancho no cabe en el muro.");
      }} />
      <NumberField id={`${key}-h`} label="Altura (m)" value={op.height} onCommit={(v) => ed.edit(() => { op.height = Math.min(v, w.height - 0.05); })} />
      {op.kind === "window"
        ? <NumberField id={`${key}-s`} label="Antepecho (m)" value={op.sill} onCommit={(v) => ed.edit(() => { op.sill = Math.max(0, Math.min(v, w.height - op.height - 0.05)); })} />
        : <button className="btn full" onClick={() => ed.edit(() => { op.flip = !op.flip; })}>Invertir apertura</button>}
    </>;
  } else if (sel && o && sel.type === "room") {
    const r = o as Model["rooms"][number], c = ed.rooms?.rooms.get(r.id);
    title = "Habitación";
    ro.push(["Superficie útil", c?.ok ? `${num(c.area)} m²` : "sin cerrar"]);
    body = <>
      <label htmlFor={`${key}-n`}>Nombre</label>
      <input id={`${key}-n`} type="text" defaultValue={r.name}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== r.name) ed.edit(() => { r.name = v; }); }} />
    </>;
  } else if (sel && o && sel.type === "line") {
    const l = o as Model["lines"][number];
    title = "Línea";
    ro.push(["Longitud", `${num(Math.hypot(l.x2 - l.x1, l.y2 - l.y1))} m`]);
  } else if (sel && o && sel.type === "dim") {
    title = "Cota alineada";
    ro.push(["Valor", `${num(dimGeom(o as Model["dims"][number]).L)} m`]);
  } else if (n > 1) {
    title = `${n} elementos seleccionados`;
    for (const [t, label] of Object.entries(TYPE_LABEL)) {
      const c = ed.sels.filter((x) => x.type === t).length;
      if (c) ro.push([label, String(c)]);
    }
  } else {
    body = <>
      <NumberField id="def-t" label="Espesor muro" value={d.thick} onCommit={(v) => { d.thick = v; ed.emit(); }} />
      <NumberField id="def-h" label="Altura muro" value={d.height} onCommit={(v) => { d.height = v; ed.emit(); }} />
      <NumberField id="def-dw" label="Ancho puerta" value={d.doorW} onCommit={(v) => { d.doorW = v; ed.emit(); }} />
      <NumberField id="def-ww" label="Ancho ventana" value={d.winW} onCommit={(v) => { d.winW = v; ed.emit(); }} />
      <NumberField id="def-s" label="Antepecho" value={d.sill} onCommit={(v) => { d.sill = v; ed.emit(); }} />
    </>;
  }

  return (
    <div key={key}>
      <p className="kind">{title}</p>
      <div className="props">
        {ro.map(([k, v]) => <Fragment key={k}><label>{k}</label><span className="ro">{v}</span></Fragment>)}
        {body}
        {n > 0 && ed.sels.some((x) => x.type !== "opening") && (
          <div className="full" style={{ display: "flex", gap: 6 }}>
            {([["move", "Mover"], ["copy", "Copiar"], ["mirror", "Simetría"]] as const).map(([t, label]) => (
              <button key={t} className="btn" style={{ flex: 1 }} onClick={() => { ed.setTool(t); onFocusCommand(); }}>{label}</button>
            ))}
          </div>
        )}
        {ed.sels.some((x) => x.type === "line") && (
          <button className="btn full" onClick={() => ed.linesToWalls()}>Convertir líneas en muros</button>
        )}
        {n > 0 && <button className="btn full" onClick={() => ed.deleteSel()}>{n > 1 ? `Borrar ${n} elementos` : "Borrar elemento"}</button>}
      </div>
    </div>
  );
}

export function Sidebar({ ed, onFocusCommand }: { ed: Editor; onFocusCommand: () => void }) {
  const counts = ed.layerCounts(), s = ed.stats();
  return (
    <aside className="side">
      <section>
        <h2>Capas</h2>
        {LAYERS.map((L) => (
          <label key={L.id} className="layer">
            <input type="checkbox" checked={ed.vis[L.id]} onChange={(e) => ed.setLayer(L.id, e.target.checked)} />
            <span className="sw" style={{ background: `var(${L.tok})` }} />
            <span>{L.label}</span>
            <span className="n">{counts[L.id]}</span>
          </label>
        ))}
      </section>
      <section>
        <h2>Propiedades</h2>
        <Properties ed={ed} onFocusCommand={onFocusCommand} />
      </section>
      <section>
        <h2>Resumen</h2>
        <dl className="stats">
          <dt>Muros</dt><dd>{num(s.wallLength)} m</dd>
          <dt>Superficie de muro neta</dt><dd>{s.wallArea.toFixed(1)} m²</dd>
          <dt>Puertas / ventanas</dt><dd>{s.doors} / {s.windows}</dd>
          <dt>Superficie útil</dt><dd>{num(s.usefulArea)} m²</dd>
        </dl>
      </section>
      <p className="hint">
        Escribe comandos como en AutoCAD: <b>M</b> muro, <b>P</b> puerta, <b>V</b> ventana, <b>L</b> línea, <b>C</b> cota,{" "}
        <b>H</b> habitación, <b>MO</b> mover, <b>CO</b> copiar, <b>SI</b> simetría, <b>TR</b> recortar, <b>AL</b> alargar, <b>DE</b> desfase. Mientras dibujas, teclea una longitud (p. ej. <b>4.5</b>) y Enter.
        Selecciona un muro y arrastra sus cuadros azules para estirarlo. Arrastra sobre el vacío para seleccionar con ventana (Mayús o Ctrl suma a la selección). Rueda para zoom; arrastra con el botón derecho, la rueda o Espacio para desplazar. F8 orto, F3 referencias.
      </p>
    </aside>
  );
}

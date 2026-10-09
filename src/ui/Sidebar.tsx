import { Fragment, useState } from "react";
import { dimGeom, dir, fits, polygonArea, roofGeom, stairSteps } from "../core/geometry";
import { LAYERS, type Model, type RoofKind } from "../core/model";
import { ROOF_LABEL, type Editor } from "../editor/Editor";

const num = (v: number) => v.toFixed(2);

function NumberField({ id, label, value, onCommit, min = 0.01, step = 0.01, digits = 2 }:
  { id: string; label: string; value: number; onCommit: (v: number) => void; min?: number; step?: number; digits?: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" step={step} min={min} value={draft ?? value.toFixed(digits)}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        onBlur={(e) => { const v = parseFloat(e.target.value); setDraft(null); if (v >= min && v !== value) onCommit(v); }} />
    </>
  );
}

function RoofKindField({ id, value, onChange }: { id: string; value: RoofKind; onChange: (k: RoofKind) => void }) {
  return (
    <>
      <label htmlFor={id}>Tipo de cubierta</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as RoofKind)}>
        {(Object.keys(ROOF_LABEL) as RoofKind[]).map((k) => <option key={k} value={k}>{ROOF_LABEL[k]}</option>)}
      </select>
    </>
  );
}

function Properties({ ed, onFocusCommand }: { ed: Editor; onFocusCommand: () => void }) {
  const sel = ed.sel, o = ed.selObj(), d = ed.defaults;
  const ro: [string, string][] = [];
  let title = "Valores por defecto", body: JSX.Element | null = null;
  const n = ed.sels.length;
  const key = sel ? `${sel.type}-${sel.id}` : n > 1 ? "multi" : "def";
  const TYPE_LABEL = { wall: "Muros", opening: "Puertas y ventanas", line: "Líneas", dim: "Cotas", room: "Habitaciones", slab: "Losas", roof: "Cubiertas", stair: "Escaleras" } as const;

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
  } else if (sel && o && sel.type === "slab") {
    const sl = o as Model["slabs"][number];
    title = "Losa";
    ro.push(["Superficie", `${num(polygonArea(sl.pts))} m²`], ["Vértices", String(sl.pts.length)]);
    body = <NumberField id={`${key}-t`} label="Espesor (m)" value={sl.thick} onCommit={(v) => ed.edit(() => { sl.thick = v; })} />;
  } else if (sel && o && sel.type === "roof") {
    const r = o as Model["roofs"][number], g = roofGeom(r);
    title = `Cubierta ${ROOF_LABEL[r.kind].toLowerCase()}`;
    ro.push(["Superficie en planta", `${num(polygonArea(g.outline))} m²`], ["Altura cumbrera", `${num(g.top)} m`]);
    body = <>
      <RoofKindField id={`${key}-k`} value={r.kind} onChange={(k) => ed.edit(() => { r.kind = k; })} />
      {r.kind !== "flat" && <NumberField id={`${key}-p`} label="Pendiente (°)" value={r.pitch} min={1} step={1} digits={0} onCommit={(v) => ed.edit(() => { r.pitch = Math.min(75, v); })} />}
      <NumberField id={`${key}-o`} label="Vuelo (m)" value={r.overhang} min={0} onCommit={(v) => ed.edit(() => { r.overhang = v; })} />
      <NumberField id={`${key}-b`} label="Arranque (m)" value={r.base} min={0} onCommit={(v) => ed.edit(() => { r.base = v; })} />
    </>;
  } else if (sel && o && sel.type === "stair") {
    const st = o as Model["stairs"][number], k = stairSteps(st);
    title = "Escalera recta";
    ro.push(["Peldaños", String(k.n)], ["Huella", `${(k.tread * 100).toFixed(1)} cm`], ["Contrahuella", `${(k.riser * 100).toFixed(1)} cm`],
      ["Longitud", `${num(k.L)} m`]);
    if (k.tread < 0.25) ro.push(["Aviso", "huella corta"]);
    body = <>
      <NumberField id={`${key}-w`} label="Ancho (m)" value={st.width} onCommit={(v) => ed.edit(() => { st.width = v; })} />
      <NumberField id={`${key}-h`} label="Desnivel (m)" value={st.height} onCommit={(v) => ed.edit(() => { st.height = v; })} />
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
      <NumberField id="def-sl" label="Espesor losa" value={d.slabThick} onCommit={(v) => { d.slabThick = v; ed.emit(); }} />
      <RoofKindField id="def-rk" value={d.roofKind} onChange={(k) => { d.roofKind = k; ed.emit(); }} />
      <NumberField id="def-rp" label="Pendiente (°)" value={d.pitch} min={1} step={1} digits={0} onCommit={(v) => { d.pitch = Math.min(75, v); ed.emit(); }} />
      <NumberField id="def-sw" label="Ancho escalera" value={d.stairW} onCommit={(v) => { d.stairW = v; ed.emit(); }} />
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

function Levels({ ed }: { ed: Editor }) {
  const levels = ed.project.levels, cur = ed.model;
  return (
    <section>
      <h2>Niveles</h2>
      <div className="levels" role="radiogroup" aria-label="Nivel activo">
        {[...levels].map((l, i) => ({ l, i })).reverse().map(({ l, i }) => (
          <button key={i} role="radio" aria-checked={i === ed.active} className="level" onClick={() => ed.setActiveLevel(i)}>
            <span>{l.name}</span><span className="n">{l.elev >= 0 ? "+" : ""}{l.elev.toFixed(2)}</span>
          </button>
        ))}
      </div>
      <div className="props" key={`lv-${ed.active}-${levels.length}`}>
        <label htmlFor="lv-name">Nombre</label>
        <input id="lv-name" type="text" defaultValue={cur.name}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== cur.name) ed.renameLevel(v); }} />
        <NumberField id="lv-elev" label="Cota (m)" value={cur.elev} onCommit={(v) => ed.setLevelElevation(v)} />
        <div className="full" style={{ display: "flex", gap: 6 }}>
          <button className="btn" style={{ flex: 1 }} onClick={() => ed.addLevel(false)} title="Nivel vacío encima, con el de abajo en gris como referencia">Nuevo nivel</button>
          <button className="btn" style={{ flex: 1 }} onClick={() => ed.addLevel(true)} title="Copia muros, huecos, losas y escaleras del nivel activo">Duplicar</button>
        </div>
        {levels.length > 1 && <button className="btn full" onClick={() => ed.deleteLevel()}>Borrar nivel</button>}
      </div>
    </section>
  );
}

export function Sidebar({ ed, onFocusCommand }: { ed: Editor; onFocusCommand: () => void }) {
  const counts = ed.layerCounts(), s = ed.stats();
  return (
    <aside className="side">
      <Levels ed={ed} />
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
        <b>H</b> habitación, <b>LO</b> losa, <b>CU</b> cubierta, <b>ES</b> escalera, <b>MO</b> mover, <b>CO</b> copiar, <b>SI</b> simetría, <b>TR</b> recortar, <b>AL</b> alargar, <b>DE</b> desfase. Mientras dibujas, teclea una longitud (p. ej. <b>4.5</b>) y Enter.
        Selecciona un muro y arrastra sus cuadros azules para estirarlo. Arrastra sobre el vacío para seleccionar con ventana (Mayús o Ctrl suma a la selección). Rueda para zoom; arrastra con el botón derecho, la rueda o Espacio para desplazar. F8 orto, F3 referencias.
      </p>
    </aside>
  );
}

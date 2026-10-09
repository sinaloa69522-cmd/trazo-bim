import { Fragment, useState } from "react";
import { dimGeom, dir, fits, polygonArea, roofGeom, slabArea, stairSteps } from "../core/geometry";
import { FURNITURE, furnitureDef } from "../core/furniture";
import { CIRCUITS, mepDef, mepOf, runLength, SYSTEMS, systemDef, type Discipline } from "../core/mep";
import { SymbolIcon, SystemIcon } from "./MepIcons";
import { GENERIC, WALL_TYPES, wallType, wallTypeLabel } from "../core/wallTypes";
import { LAYERS, type Model, type RoofKind, type RunSystem } from "../core/model";
import { ROOF_LABEL, type Editor } from "../editor/Editor";
import { HATCH_PATTERNS, hatchArea, hatchPattern, hatchSegments, IMPORTED, patternLines } from "../core/hatch";

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

function WallTypeField({ id, value, label = "Tipo de muro", onChange }: { id: string; value: string; label?: string; onChange: (t: string) => void }) {
  return (
    <>
      <label htmlFor={id} className="full">{label}</label>
      <select id={id} className="full" value={value} onChange={(e) => e.target.value && onChange(e.target.value)}>
        {!value && <option value="">Elige un tipo…</option>}
        {WALL_TYPES.map((t) => <option key={t.id} value={t.id}>{t.id === GENERIC ? t.name : `${t.name} (${t.thick.toFixed(2)} m)`}</option>)}
      </select>
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

/** Muestra de una trama: un cuadro de 0,8 m dibujado con sus líneas. */
function HatchSwatch({ pattern, scale = 1, angle = 0 }: { pattern: string; scale?: number; angle?: number }) {
  const S = 0.8, sq = [[{ x: 0, y: 0 }, { x: S, y: 0 }, { x: S, y: S }, { x: 0, y: S }]];
  const solid = hatchPattern(pattern)?.solid, segs = solid ? [] : hatchSegments(sq, patternLines({ pattern, scale, angle })).segs;
  return (
    <svg className="swatch" viewBox={`0 0 ${S} ${S}`} width={30} height={30} aria-hidden="true">
      {solid ? <rect width={S} height={S} fill="currentColor" opacity={0.5} />
        : <path d={segs.map(([a, b]) => `M${a.x.toFixed(3)} ${a.y.toFixed(3)}L${(b.x + (a.x === b.x && a.y === b.y ? 0.01 : 0)).toFixed(3)} ${b.y.toFixed(3)}`).join("")}
          stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" />}
      <rect width={S} height={S} fill="none" stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.4} />
    </svg>
  );
}

function PatternField({ id, value, imported, onChange }: { id: string; value: string; imported?: string; onChange: (p: string) => void }) {
  return (
    <>
      <label htmlFor={id}>Trama</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {imported !== undefined && <option value={IMPORTED}>Original{imported ? ` (${imported})` : ""}</option>}
        {HATCH_PATTERNS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
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
  const TYPE_LABEL = { wall: "Muros", opening: "Puertas y ventanas", line: "Líneas", dim: "Cotas", room: "Habitaciones", slab: "Losas", roof: "Cubiertas", stair: "Escaleras", furniture: "Mobiliario", section: "Secciones", text: "Textos", fixture: "Instalaciones", run: "Tuberías", underlay: "Calcos", hatch: "Sombreados" } as const;

  if (sel && o && sel.type === "wall") {
    const w = o as Model["walls"][number], up = ed.levelAbove();
    title = wallTypeLabel(w);
    ro.push(["Longitud", `${num(dir(w).L)} m`], ["Área de muro", `${num(dir(w).L * w.height)} m²`], ["Material", wallType(w.type).material]);
    body = <>
      <WallTypeField id={`${key}-ty`} value={w.type} onChange={(t) => ed.setWallType([w.id], t)} />
      {w.type === GENERIC
        ? <NumberField id={`${key}-t`} label="Espesor (m)" value={w.thick} onCommit={(v) => ed.edit(() => { w.thick = v; })} />
        : <><label>Espesor (m)</label><span className="ro" title="Lo fija el tipo; elige Muro genérico para cambiarlo">{num(w.thick)}</span></>}
      {w.attach && up
        ? <><label>Altura (m)</label><span className="ro" title={`Llega a la losa de ${up.name}`}>{num(w.height)}</span></>
        : <NumberField id={`${key}-h`} label="Altura (m)" value={w.height} onCommit={(v) => ed.edit(() => { w.height = v; })} />}
      <label className="check full">
        <input type="checkbox" checked={w.attach} onChange={(e) => ed.edit(() => { w.attach = e.target.checked; })} />
        Hasta la losa del nivel de arriba
      </label>
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
    ro.push(["Superficie", `${num(slabArea(sl))} m²`], ["Vértices", String(sl.pts.length)]);
    if (sl.holes.length) ro.push(["Huecos", `${sl.holes.length} (${num(sl.holes.reduce((s, h) => s + polygonArea(h), 0))} m²)`]);
    body = <>
      <NumberField id={`${key}-t`} label="Espesor (m)" value={sl.thick} onCommit={(v) => ed.edit(() => { sl.thick = v; })} />
      {sl.holes.length > 0 && <button className="btn full" onClick={() => ed.clearHoles(sl.id)}>Quitar huecos</button>}
    </>;
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
      <button className="btn full" onClick={() => ed.openAboveStair(st.id)} title="Hueco con la huella de la escalera en la losa del nivel de arriba">Abrir hueco en la losa de arriba</button>
    </>;
  } else if (sel && o && sel.type === "furniture") {
    const f = o as Model["furniture"][number], d = furnitureDef(f.kind);
    title = d.label;
    ro.push(["Medidas (m)", `${num(d.w)}×${num(d.d)}`]);
    body = <>
      <label htmlFor={`${key}-k`}>Pieza</label>
      <select id={`${key}-k`} value={f.kind} onChange={(e) => ed.edit(() => { f.kind = e.target.value; })}>
        {FURNITURE.map((x) => <option key={x.kind} value={x.kind}>{x.label}</option>)}
      </select>
      <NumberField id={`${key}-r`} label="Giro (°)" value={f.rot} min={0} step={15} digits={0} onCommit={(v) => ed.edit(() => { f.rot = v % 360; })} />
      <button className="btn full" onClick={() => ed.edit(() => { f.rot = (f.rot + 90) % 360; })}>Girar 90°</button>
    </>;
  } else if (sel && o && sel.type === "section") {
    const se = o as Model["sections"][number];
    title = `Sección ${se.name}-${se.name}'`;
    ro.push(["Longitud del corte", `${num(Math.hypot(se.x2 - se.x1, se.y2 - se.y1))} m`], ["Se ve", "a la izquierda de la línea"]);
    body = <>
      <label htmlFor={`${key}-n`}>Letra</label>
      <input id={`${key}-n`} type="text" defaultValue={se.name} maxLength={4}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        onBlur={(e) => {
          const v = e.target.value.trim().toUpperCase();
          if (!v || v === se.name) return;
          if (ed.project.levels.some((l) => l.sections.some((x) => x !== se && x.name === v))) { ed.log(`Ya hay una sección ${v}.`); e.target.value = se.name; return; }
          ed.edit(() => { se.name = v; });
        }} />
      <button className="btn full" onClick={() => ed.flipSection(se.id)}>Invertir sentido de la vista</button>
      <p className="hint">La sección se ve en Lámina › Contenido › Secciones.</p>
    </>;
  } else if (sel && o && sel.type === "text") {
    const t = o as Model["texts"][number];
    title = "Texto";
    body = <>
      <label htmlFor={`${key}-x`} className="full">Contenido</label>
      <input id={`${key}-x`} className="full" type="text" defaultValue={t.text}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== t.text) ed.edit(() => { t.text = v; }); }} />
      <NumberField id={`${key}-s`} label="Altura letra (m)" value={t.size} min={0.02} onCommit={(v) => ed.edit(() => { t.size = v; })} />
      <NumberField id={`${key}-r`} label="Giro (°)" value={t.rot} min={-360} step={15} digits={0} onCommit={(v) => ed.edit(() => { t.rot = v % 360; })} />
    </>;
  } else if (sel && o && sel.type === "fixture") {
    const f = o as Model["fixtures"][number], d = mepDef(f.kind);
    title = d.label;
    ro.push(["Disciplina", d.disc === "elec" ? "Electricidad" : "Plomería"]);
    body = <>
      <label htmlFor={`${key}-k`}>Tipo</label>
      <select id={`${key}-k`} value={f.kind} onChange={(e) => ed.edit(() => { f.kind = e.target.value; f.h = mepDef(f.kind).h; f.circuit = mepDef(f.kind).circuit; })}>
        {mepOf(d.disc).map((x) => <option key={x.kind} value={x.kind}>{x.label}</option>)}
      </select>
      {d.disc === "elec" && f.kind !== "cuadro" && <>
        <label htmlFor={`${key}-c`}>Circuito</label>
        <select id={`${key}-c`} value={f.circuit} onChange={(e) => ed.edit(() => { f.circuit = e.target.value; })}>
          {Object.entries(CIRCUITS).map(([c, n]) => <option key={c} value={c}>{c} · {n}</option>)}
        </select>
      </>}
      <NumberField id={`${key}-h`} label="Altura de montaje (m)" value={f.h} min={0} onCommit={(v) => ed.edit(() => { f.h = v; })} />
      <NumberField id={`${key}-r`} label="Giro (°)" value={f.rot} min={0} step={15} digits={0} onCommit={(v) => ed.edit(() => { f.rot = v % 360; })} />
    </>;
  } else if (sel && o && sel.type === "run") {
    const r = o as Model["runs"][number];
    title = systemDef(r.system).label;
    ro.push(["Longitud", `${num(runLength(r))} m`], ["Tramos", String(r.pts.length - 1)]);
    body = <>
      <label htmlFor={`${key}-s`}>Red</label>
      <select id={`${key}-s`} value={r.system} onChange={(e) => ed.edit(() => { r.system = e.target.value as RunSystem; })}>
        {SYSTEMS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
      </select>
    </>;
  } else if (sel && o && sel.type === "line") {
    const l = o as Model["lines"][number];
    title = "Línea";
    ro.push(["Longitud", `${num(Math.hypot(l.x2 - l.x1, l.y2 - l.y1))} m`]);
  } else if (sel && o && sel.type === "underlay") {
    const u = o as Model["underlays"][number];
    title = "Calco";
    ro.push(["Imagen", u.name], ["Tamaño", `${num(u.w)} × ${num(u.h)} m`]);
    body = <>
      <label htmlFor={`${key}-op`}>Opacidad</label>
      <input id={`${key}-op`} type="range" min={0.1} max={1} step={0.05} value={u.opacity}
        onChange={(e) => { u.opacity = +e.target.value; ed.touch(); }} />
      <NumberField id={`${key}-w`} label="Ancho (m)" value={u.w} onCommit={(v) => ed.edit(() => { u.h *= v / u.w; u.w = v; })} />
    </>;
  } else if (sel && o && sel.type === "hatch") {
    const h = o as Model["hatches"][number], lib = hatchPattern(h.pattern);
    title = "Sombreado";
    ro.push(["Superficie", `${num(hatchArea(h.loops))} m²`]);
    if (h.loops.length > 1) ro.push(["Islas", String(h.loops.length - 1)]);
    if (h.name) ro.push(["Trama de origen", h.name]);
    body = <>
      <PatternField id={`${key}-p`} value={h.pattern} imported={h.lines?.length ? h.name ?? "" : undefined} onChange={(v) => ed.edit(() => { h.pattern = v; })} />
      {lib && !lib.solid && <>
        <NumberField id={`${key}-s`} label="Escala" value={h.scale} min={0.05} step={0.1} onCommit={(v) => ed.edit(() => { h.scale = v; })} />
        <NumberField id={`${key}-a`} label="Giro (°)" value={h.angle} min={-360} step={15} digits={0} onCommit={(v) => ed.edit(() => { h.angle = v % 360; })} />
      </>}
    </>;
  } else if (sel && o && sel.type === "dim") {
    title = "Cota alineada";
    ro.push(["Valor", `${num(dimGeom(o as Model["dims"][number]).L)} m`]);
  } else if (n > 1) {
    title = `${n} elementos seleccionados`;
    for (const [t, label] of Object.entries(TYPE_LABEL)) {
      const c = ed.sels.filter((x) => x.type === t).length;
      if (c) ro.push([label, String(c)]);
    }
    const walls = ed.sels.filter((x) => x.type === "wall").map((x) => x.id);
    if (walls.length) body = <WallTypeField id="multi-ty" label={`Tipo de los ${walls.length} muros`} value=""
      onChange={(t) => ed.setWallType(walls, t)} />;
  } else {
    body = <>
      <WallTypeField id="def-ty" value={d.wallType} onChange={(t) => { d.wallType = t; if (t !== GENERIC) d.thick = wallType(t).thick; ed.emit(); }} />
      {d.wallType === GENERIC && <NumberField id="def-t" label="Espesor muro" value={d.thick} onCommit={(v) => { d.thick = v; ed.emit(); }} />}
      <NumberField id="def-h" label="Altura muro" value={d.height} onCommit={(v) => { d.height = v; ed.emit(); }} />
      <NumberField id="def-dw" label="Ancho puerta" value={d.doorW} onCommit={(v) => { d.doorW = v; ed.emit(); }} />
      <NumberField id="def-ww" label="Ancho ventana" value={d.winW} onCommit={(v) => { d.winW = v; ed.emit(); }} />
      <NumberField id="def-s" label="Antepecho" value={d.sill} onCommit={(v) => { d.sill = v; ed.emit(); }} />
      <NumberField id="def-sl" label="Espesor losa" value={d.slabThick} onCommit={(v) => { d.slabThick = v; ed.emit(); }} />
      <RoofKindField id="def-rk" value={d.roofKind} onChange={(k) => { d.roofKind = k; ed.emit(); }} />
      <NumberField id="def-rp" label="Pendiente (°)" value={d.pitch} min={1} step={1} digits={0} onCommit={(v) => { d.pitch = Math.min(75, v); ed.emit(); }} />
      <NumberField id="def-tx" label="Altura texto" value={d.textSize} min={0.02} onCommit={(v) => { d.textSize = v; ed.emit(); }} />
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
        {ed.sels.some((x) => x.type === "underlay" || x.type === "line") && (
          <button className="btn full" onClick={() => { ed.setTool("calibrate"); onFocusCommand(); }}
            title="Marca dos puntos de una medida conocida y escribe cuánto mide (comando CAL)">Calibrar escala</button>
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

function Catalog({ ed }: { ed: Editor }) {
  return (
    <section>
      <h2>Mobiliario</h2>
      <div className="catalog" role="radiogroup" aria-label="Pieza a colocar">
        {FURNITURE.map((f) => (
          <button key={f.kind} role="radio" aria-checked={ed.defaults.furnKind === f.kind} className="cat" onClick={() => ed.pickFurniture(f.kind)}>
            {f.label}<small>{num(f.w)} × {num(f.d)}</small>
          </button>
        ))}
      </div>
      <p className="hint">Clic en la planta para colocar. <b>R</b> y Enter gira 90° (ahora {ed.defaults.furnRot}°).</p>
    </section>
  );
}

function MepCatalog({ ed }: { ed: Editor }) {
  const disc: Discipline = mepDef(ed.defaults.mepKind).disc;
  return (
    <section>
      <h2>{disc === "elec" ? "Electricidad" : "Plomería"}</h2>
      <div className="catalog" role="radiogroup" aria-label="Elemento a colocar">
        {mepOf(disc).map((f) => (
          <button key={f.kind} role="radio" aria-checked={ed.defaults.mepKind === f.kind} className="cat sym-cat" onClick={() => ed.pickFixture(f.kind)}>
            <SymbolIcon kind={f.kind} /><span>{f.label}<small>{f.circuit ? `${f.circuit} · ` : ""}h {num(f.h)} m</small></span>
          </button>
        ))}
      </div>
      <div className="props" style={{ marginTop: 8 }}>
        {disc === "elec"
          ? <button className="btn full" onClick={() => ed.placeRoomLights()}>Punto de luz en cada habitación</button>
          : <button className="btn full" onClick={() => ed.placeSanitaryPoints()}>Tomas y desagües en los aparatos sanitarios</button>}
        <button className="btn full" onClick={() => ed.routeDiscipline(disc)}
          title={disc === "elec" ? "Un recorrido por circuito desde el cuadro general" : "Agua fría desde la llave de paso, caliente desde el termo y desagües a la bajante"}>
          {disc === "elec" ? "Trazar circuitos desde el cuadro" : "Trazar tuberías automáticamente"}
        </button>
      </div>
      <p className="hint">Los enchufes, interruptores y apliques se pegan al muro más cercano. Fuera de un muro, <b>R</b> y Enter gira 90°.</p>
    </section>
  );
}

function RunCatalog({ ed }: { ed: Editor }) {
  return (
    <section>
      <h2>Tubería</h2>
      <div className="catalog" role="radiogroup" aria-label="Red">
        {SYSTEMS.map((x) => (
          <button key={x.id} role="radio" aria-checked={ed.defaults.runSys === x.id} className="cat sym-cat" onClick={() => ed.pickSystem(x.id)}>
            <SystemIcon sys={x.id} /><span>{x.label}</span>
          </button>
        ))}
      </div>
      <p className="hint">Clic en cada vértice; se engancha a los puntos de las instalaciones. Enter o Esc termina el recorrido.</p>
    </section>
  );
}

/** Con la herramienta Sombreado: trama, escala y cómo se elige la zona. */
function HatchTools({ ed }: { ed: Editor }) {
  const d = ed.defaults;
  return (
    <section>
      <h2>Sombreado</h2>
      <div className="catalog" role="radiogroup" aria-label="Trama">
        {HATCH_PATTERNS.map((p) => (
          <button key={p.id} role="radio" aria-checked={d.hatchPattern === p.id} className="cat sym-cat" onClick={() => { d.hatchPattern = p.id; ed.emit(); }}>
            <HatchSwatch pattern={p.id} /><span>{p.label}<small>{p.acad}</small></span>
          </button>
        ))}
      </div>
      <div className="props" style={{ marginTop: 8 }}>
        <NumberField id="hat-s" label="Escala" value={d.hatchScale} min={0.05} step={0.1} onCommit={(v) => { d.hatchScale = v; ed.emit(); }} />
        <NumberField id="hat-a" label="Giro (°)" value={d.hatchAngle} min={-360} step={15} digits={0} onCommit={(v) => { d.hatchAngle = v % 360; ed.emit(); }} />
        <label className="check full">
          <input type="checkbox" checked={d.hatchMode === "room"} onChange={(e) => { d.hatchMode = e.target.checked ? "room" : "poly"; ed.emit(); }} />
          Clic dentro de una habitación la sombrea entera
        </label>
      </div>
      <p className="hint">{d.hatchMode === "room" ? "Clic dentro de una habitación cerrada, o fuera de ellas para dibujar un contorno." : "Dibuja el contorno vértice a vértice."} Enter o clic en el primer vértice cierra el contorno.</p>
    </section>
  );
}

/** Con la herramienta Cota: acotado automático de las fachadas (comando AC). */
function DimTools({ ed }: { ed: Editor }) {
  const auto = ed.model.dims.filter((d) => d.auto).length;
  return (
    <section>
      <h2>Cotas</h2>
      <p className="hint">Clic en dos puntos y un tercero para separar la cota del dibujo.</p>
      <button className="btn primary wide" onClick={() => ed.autoDimension()} title="Comando AC">
        {auto ? "Rehacer cotas de fachada" : "Acotar fachadas"}
      </button>
      {auto > 0 && <button className="btn wide" onClick={() => ed.clearAutoDims()}>Quitar cotas automáticas ({auto})</button>}
      <p className="hint">Pone tres cadenas por fachada: huecos, muros que acometen y total, a cara exterior.</p>
    </section>
  );
}

export function Sidebar({ ed, onFocusCommand, onClose }: { ed: Editor; onFocusCommand: () => void; onClose?: () => void }) {
  const counts = ed.layerCounts(), s = ed.stats();
  return (
    <aside className="side" aria-label="Capas y propiedades">
      {onClose && <button className="btn sideclose" onClick={onClose}>Cerrar</button>}
      {ed.tool === "furniture" && <Catalog ed={ed} />}
      {ed.tool === "fixture" && <MepCatalog ed={ed} />}
      {ed.tool === "run" && <RunCatalog ed={ed} />}
      {ed.tool === "dim" && <DimTools ed={ed} />}
      {ed.tool === "hatch" && <HatchTools ed={ed} />}
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
        Escribe comandos como en AutoCAD: <b>M</b> muro, <b>P</b> puerta, <b>V</b> ventana, <b>L</b> línea, <b>C</b> cota, <b>AC</b> acotar fachadas,{" "}
        <b>H</b> habitación, <b>LO</b> losa, <b>SB</b> sombreado, <b>CU</b> cubierta, <b>ES</b> escalera, <b>MB</b> mobiliario, <b>EL</b> electricidad, <b>PL</b> plomería, <b>TU</b> tubería, <b>MO</b> mover, <b>CO</b> copiar, <b>SI</b> simetría, <b>TR</b> recortar, <b>AL</b> alargar, <b>DE</b> desfase, <b>CAL</b> calibrar un calco. Mientras dibujas, teclea una longitud (p. ej. <b>4.5</b>) y Enter.
        Selecciona un muro y arrastra sus cuadros azules para estirarlo. Arrastra sobre el vacío para seleccionar con ventana (Mayús o Ctrl suma a la selección). Rueda para zoom; arrastra con el botón derecho, la rueda o Espacio para desplazar. F8 orto, F3 referencias.
      </p>
    </aside>
  );
}

import { mepDef, systemDef, type SymStroke } from "../core/mep";
import type { RunSystem } from "../core/model";

/** Símbolo de instalaciones en SVG, para la biblioteca y las leyendas de las láminas. */
export function SymbolIcon({ kind, size = 22 }: { kind: string; size?: number }) {
  const d = mepDef(kind), col = systemDef(d.sys).color, ks: SymStroke[] = d.draw();
  const r = kind === "termo" ? 0.5 : 0.3, cy = kind === "termo" ? 0.2 : 0;
  return (
    <svg width={size} height={size} viewBox={`${-r} ${cy - r} ${2 * r} ${2 * r}`} aria-hidden="true" className="sym">
      {ks.map((k, i) => {
        const pts = k.pts.map((q) => `${q.x},${q.y}`).join(" ");
        const st = { stroke: col, strokeWidth: 0.025, fill: k.fill ? col : "none" };
        return k.closed ? <polygon key={i} points={pts} {...st} /> : <polyline key={i} points={pts} {...st} />;
      })}
      {d.text && <text x={0} y={kind === "termo" ? 0.24 : 0.06} fontSize={kind === "cuadro" ? 0.09 : 0.11} textAnchor="middle" fill={col} fontWeight={600}>{d.text}</text>}
    </svg>
  );
}

/** Muestra de la red en SVG. */
export function SystemIcon({ sys, w = 30 }: { sys: RunSystem; w?: number }) {
  const d = systemDef(sys);
  return (
    <svg width={w} height={10} aria-hidden="true" className="sym">
      <line x1={1} y1={5} x2={w - 1} y2={5} stroke={d.color} strokeWidth={d.width * 1.2} strokeDasharray={d.dash.join(" ")} />
    </svg>
  );
}

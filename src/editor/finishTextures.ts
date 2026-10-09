// Texturas de los acabados exteriores, pintadas en un lienzo a partir del despiece de cada uno.
// El lienzo es un módulo que se repite: tw × th metros con un número entero de hiladas y piezas.
import { rand, type Finish } from "../core/finishes";

export interface FinishTile { canvas: HTMLCanvasElement; tw: number; th: number }

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
/** Color base aclarado (k > 0) u oscurecido (k < 0). */
function shade(c: string, k: number) {
  const v = hex(c).map((x) => Math.round(k >= 0 ? x + (255 - x) * k : x * (1 + k)));
  return `rgb(${v.map((x) => Math.max(0, Math.min(255, x))).join(",")})`;
}

/** Repite un paso hasta cubrir unos 1,2 m con un número entero (y par, si hay matajunta). */
const span = (step: number, even = false) => { let n = Math.max(1, Math.round(1.2 / step)); if (even && n % 2) n++; return step * n; };

const cache = new Map<string, FinishTile>();

export function finishTile(f: Finish, ppm = 170): FinishTile {
  const key = `${f.id}@${ppm}`, hit = cache.get(key);
  if (hit) return hit;
  const th = f.row ? span(f.row, !!f.bond) : f.dots ? 1.2 : 1.2;
  const tw = f.len ? span(f.len) : f.col ? span(f.col) : 1.2;
  const W = Math.max(8, Math.round(tw * ppm)), H = Math.max(8, Math.round(th * ppm));
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d")!, sx = W / tw, sy = H / th, R = rand(f.id.length * 977 + f.id.charCodeAt(0) * 31);
  const vary = f.vary ?? 0, tone = () => shade(f.color, (R() - 0.5) * 2 * vary);
  g.fillStyle = f.color; g.fillRect(0, 0, W, H);
  const line = (x0: number, y0: number, x1: number, y1: number, c: string, w = 1) => {
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.strokeStyle = c; g.lineWidth = w; g.stroke();
  };

  if (f.row) {
    const rows = Math.round(th / f.row), rh = H / rows;
    for (let i = 0; i < rows; i++) {
      const y = i * rh;
      // piezas de la hilada: regulares (con matajunta) o de largo irregular que cierran el módulo
      let cuts: number[] = [];
      if (f.len) {
        const n = Math.round(tw / f.len);
        if (f.random) {
          const ws = Array.from({ length: n }, () => 0.55 + R() * 0.9), t = ws.reduce((a, b) => a + b, 0);
          let x = R() * W; cuts = ws.map((w) => (x = (x + (w / t) * W) % W));
        } else cuts = Array.from({ length: n }, (_, k) => ((k + (f.bond && i % 2 ? 0.5 : 0)) * W) / n);
        cuts.sort((a, b) => a - b);
        for (let k = 0; k < cuts.length; k++) {
          const a = cuts[k], b = k + 1 < cuts.length ? cuts[k + 1] : cuts[0] + W;
          g.fillStyle = tone();
          g.fillRect(a, y, b - a, rh); if (b > W) g.fillRect(a - W, y, b - a, rh);
        }
      } else if (vary) { g.fillStyle = tone(); g.fillRect(0, y, W, rh); }
      // sombra bajo el canto de la pieza de arriba y brillo en su borde
      const lapShadow = { lap: 0.22, dutch: 0.2, shake: 0.18, shingle: 0.16, arch: 0.22, slate: 0.12, flat: 0.12, barrel: 0, brick: 0, stone: 0, membrane: 0 } as Record<string, number>;
      const sh = lapShadow[f.style] ?? 0;
      if (sh) {
        const gr = g.createLinearGradient(0, y, 0, y + rh * 0.35);
        gr.addColorStop(0, "rgba(0,0,0,0.38)"); gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr; g.fillRect(0, y, W, rh * 0.35);
        g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(0, y + rh - Math.max(1, rh * 0.06), W, Math.max(1, rh * 0.06));
      }
      if (f.style === "dutch") line(0, y + rh * 0.45, W, y + rh * 0.45, "rgba(0,0,0,0.25)", Math.max(1, rh * 0.05));
      if (f.style === "arch") {
        // teja arquitectónica: lengüetas más oscuras de ancho variable
        for (let k = 0; k < cuts.length; k++) if (R() < 0.45) {
          const a = cuts[k], b = k + 1 < cuts.length ? cuts[k + 1] : cuts[0] + W;
          g.fillStyle = "rgba(0,0,0,0.22)"; g.fillRect(a, y + rh * 0.5, (b - a) * 0.6, rh * 0.5);
        }
      }
      // juntas
      const joint = f.style === "brick" || f.style === "stone" ? shade("#c9c3b8", 0) : "rgba(0,0,0,0.45)";
      const jw = f.style === "brick" || f.style === "stone" ? Math.max(1.5, 0.01 * sy) : 1;
      if (f.style !== "barrel") line(0, y, W, y, joint, jw);
      for (const x of cuts) line(x, y, x, y + rh, joint, f.style === "shingle" || f.style === "flat" ? Math.max(1, 0.006 * sx) : jw);
    }
  }

  if (f.col) {
    const n = Math.round(tw / f.col), cw = W / n;
    for (let k = 0; k < n; k++) {
      const x = k * cw;
      if (f.style === "batten") {
        const bw = 0.06 * sx;
        g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(x + bw, 0, Math.max(1, bw * 0.25), H);
        g.fillStyle = shade(f.color, 0.08); g.fillRect(x, 0, bw, H);
        line(x, 0, x, H, "rgba(0,0,0,0.3)");
      } else if (f.style === "groove") {
        line(x, 0, x, H, "rgba(0,0,0,0.45)", Math.max(1.5, 0.008 * sx));
      } else if (f.style === "seam" || f.style === "panel") {
        line(x + 1, 0, x + 1, H, "rgba(255,255,255,0.35)", Math.max(1, 0.006 * sx));
        line(x + 3, 0, x + 3, H, "rgba(0,0,0,0.45)", Math.max(1.5, 0.01 * sx));
      } else if (f.style === "corr" || f.style === "barrel") {
        // ondas: degradado claro-oscuro por cada canal
        const gr = g.createLinearGradient(x, 0, x + cw, 0);
        gr.addColorStop(0, "rgba(0,0,0,0.32)"); gr.addColorStop(0.45, "rgba(255,255,255,0.22)"); gr.addColorStop(1, "rgba(0,0,0,0.32)");
        g.fillStyle = gr; g.fillRect(x, 0, cw, H);
      } else if (f.style === "membrane") {
        line(x, 0, x, H, "rgba(0,0,0,0.12)", 2);
      }
    }
    if (f.style === "barrel" && f.row) {
      // solape de cada fila de tejas
      const rows = Math.round(th / f.row), rh = H / rows;
      for (let i = 0; i < rows; i++) {
        const gr = g.createLinearGradient(0, i * rh, 0, i * rh + rh * 0.25);
        gr.addColorStop(0, "rgba(0,0,0,0.35)"); gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr; g.fillRect(0, i * rh, W, rh * 0.25);
      }
    }
  }

  if (f.dots) {
    // grano: estuco fino o vegetación en manchas
    const n = Math.round(W * H * (f.style === "green" ? 0.02 : 0.05));
    for (let i = 0; i < n; i++) {
      const x = R() * W, y = R() * H, r = f.style === "green" ? 1.5 + R() * 4 : 0.8 + R();
      g.fillStyle = f.style === "green" ? shade(f.color, (R() - 0.5) * 0.6) : R() < 0.5 ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.2)";
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  }
  const t = { canvas: cv, tw, th };
  cache.set(key, t);
  return t;
}

/** Muestra cuadrada para los selectores, como imagen. */
export function finishSwatch(f: Finish): string {
  const t = finishTile(f, 110), c = document.createElement("canvas"), S = 64;
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.fillStyle = g.createPattern(t.canvas, "repeat")!;
  g.fillRect(0, 0, S, S);
  return c.toDataURL();
}

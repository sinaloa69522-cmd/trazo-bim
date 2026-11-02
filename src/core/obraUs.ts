// Programa de obra para EE.UU.: la secuencia de una casa wood frame (site prep, footings & slab, framing,
// dry-in, rough-in e inspecciones, insulation, drywall, trim, finishes, final), semanas de lunes a viernes,
// duraciones de las cantidades del presupuesto de EE.UU. con rendimientos de subcontratista, y el importe de
// cada actividad tomado de sus partidas para que la suma sea el subtotal del presupuesto.

import { budget, defaultBudget } from "./budget";
import { dir } from "./geometry";
import type { Project } from "./model";
import { finishProgram, type Activity, type Program } from "./obra";
import { FT } from "./units";

/** Días de trabajo por semana en EE.UU. (lunes a viernes) */
export const WEEK_US = 5;

const ceil = (v: number, min = 1) => Math.max(min, Math.ceil(v - 1e-9));
const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

/** Actividad a la que va cada partida; las de instalaciones se reparten 60 % rough-in y 40 % trim-out. */
function bucket(code: string): string | [string, number][] {
  const ch = code.slice(0, 2);
  if (code === "01.01") return "site";
  if (ch === "01" || code === "02.01") return "found";
  if (code === "02.02" || ch === "03" && code !== "03.04") return "frame";
  if (code === "03.04") return "rframe";
  if (ch === "04") return "roof";
  if (code === "05.01" || code === "12.05") return "siding";
  if (ch === "05") return "insul";
  if (code === "06.02" || code === "06.03") return "win";
  if (code === "06.01" || code === "12.04" || /^11\.2\d$/.test(code)) return "trim";
  if (ch === "07") return "deck";
  if (ch === "08" || code === "12.02") return "floor";
  if (ch === "09" || ch === "10" || ch === "13") return [["rough", 0.6], ["mept", 0.4]];
  if (ch === "11") return "mept";
  if (code === "12.01") return "dw";
  if (code === "12.03") return "paint";
  return "final";
}

export function programUs(p: Project): Program {
  const b = budget(p, p.budget ?? defaultBudget()), k = 1 + (p.budget?.indirect ?? 20) / 100;
  const items = b.chapters.flatMap((c) => c.items);
  const qty = (code: string) => items.find((i) => i.code === code)?.qty ?? 0;
  const sum = (re: RegExp) => items.filter((i) => re.test(i.code)).reduce((t, i) => t + i.qty, 0);
  const cost = new Map<string, number>();
  for (const it of items) {
    const to = bucket(it.code);
    for (const [id, f] of typeof to === "string" ? [[to, 1] as [string, number]] : to) cost.set(id, (cost.get(id) ?? 0) + it.amount * k * f);
  }
  const L = p.levels, acts: Activity[] = [];
  const add = (id: string, name: string, start: number, days: number, q: string, c = cost.get(id) ?? 0) => {
    const a = { id, name, start: Math.max(0, Math.round(start)), days, qty: q, cost: c }; acts.push(a); return a;
  };
  const end = (a: Activity) => a.start + a.days;

  const site = add("site", "Site prep, layout & erosion control", 0, ceil(qty("01.01") / 1000, 3), `${n0(qty("01.01"))} sq ft`);
  const ftg = qty("01.02") + qty("01.03"), slab = qty("02.01");
  // forms, footing inspection, pour, slab prep, pre-pour inspection, pour and 7-day cure
  const found = add("found", "Footings & slab on grade (with footing inspection)", end(site), ceil(ftg / 60 + slab / 750 + 8, 10), `${n0(ftg)} LF footing · ${n0(slab)} sq ft slab`);

  // framing by level: floor system of that level, then walls; cost split by wall area
  const wallSf = L.map((lv) => lv.walls.reduce((s, w) => s + dir(w).L * w.height, 0) / (FT * FT));
  const wallTot = wallSf.reduce((s, a) => s + a, 0) || 1, frameCost = cost.get("frame") ?? 0;
  const floorSf = qty("02.02"), upper = L.slice(1).filter((lv) => lv.walls.length).length || 1;
  let t = end(found), last: Activity = found;
  L.forEach((lv, i) => {
    if (!wallSf[i]) return;
    const fl = i > 0 ? floorSf / upper : 0;
    last = add(`frame${i}`, `Framing · ${lv.name}${fl ? " (floor system & walls)" : ""}`, t, ceil(wallSf[i] / 200 + fl / 500, 8), `${n0(wallSf[i])} sq ft wall`, frameCost * (wallSf[i] / wallTot));
    t = end(last);
  });
  const roofSf = qty("03.04");
  const rframe = roofSf ? add("rframe", "Roof trusses & sheathing", end(last), ceil(roofSf / 400, 4), `${n0(roofSf)} sq ft`) : last;
  const dry = end(rframe);
  const sq = qty("04.01") + qty("04.02") / 100;
  const roof = sq ? add("roof", "Roofing, flashing & gutters (dry-in)", dry, ceil(sq / 6, 3), `${sq.toFixed(1)} SQ`) : null;
  const ops = qty("06.02") + Math.ceil(qty("06.03") / 15);
  const win = add("win", "Windows & exterior doors", dry, ceil(ops / 6, 3), `${n0(qty("06.03"))} sq ft glazing · ${qty("06.02")} door${qty("06.02") === 1 ? "" : "s"}`);

  // MEP rough-in from dry-in; inspections and insulation when both rough-in and openings are done
  const runs = sum(/^(09\.90|10\.9[1-3])$/), dev = sum(/^(09|10)\.\d{2}$/) - runs;
  const rough = add("rough", "Plumbing, electrical & HVAC rough-in", dry, ceil(dev / 8 + runs / 250 + 5, 12), `${n0(dev)} outlets & fixtures`);
  const sid = qty("05.01");
  const siding = sid ? add("siding", "WRB, siding, exterior trim & paint", end(win), ceil(sid / 250, 7), `${n0(sid)} sq ft`) : win;
  const ins = qty("05.02") + qty("05.03");
  const insul = add("insul", "Rough-in & framing inspections, insulation", Math.max(end(rough), end(win), roof ? end(roof) : 0), ceil(ins / 1500 + 5, 6), `${n0(ins)} sq ft`);
  const board = qty("12.01");
  const dw = add("dw", "Drywall hang, tape & finish", end(insul), ceil(board / 600, 10), `${n0(board)} sq ft`);
  const tr = qty("12.04"), cab = qty("11.20") + qty("11.21"), drs = qty("06.01");
  const trim = add("trim", "Interior doors, trim & cabinets", end(dw), ceil(tr / 120 + cab / 15 + drs / 4, 6), `${n0(tr)} LF trim · ${drs} door${drs === 1 ? "" : "s"}`);
  const pa = qty("12.03");
  const paint = add("paint", "Interior paint", Math.max(end(dw) + 1, end(trim) - 2), ceil(pa / 1200, 5), `${n0(pa)} sq ft`);
  const fl = qty("08.01") + qty("08.02") + qty("12.02");
  const floor = add("floor", "Tile & flooring", end(paint), ceil(fl / 200, 5), `${n0(fl)} sq ft`);
  const fx = sum(/^11\.[a-z]/) + qty("11.30");
  const mept = add("mept", "MEP trim-out, fixtures & appliances", end(paint), ceil(fx / 2 + dev / 20, 6), `${n0(fx)} fixtures`);
  const dk = qty("07.02"), fls = qty("07.01");
  const deck = dk || fls ? add("deck", "Stairs, decks & porches", dk ? end(siding) : end(dw), ceil(dk / 100 + fls * 4, 4), [dk && `${n0(dk)} sq ft deck`, fls && `${fls} flight${fls > 1 ? "s" : ""}`].filter(Boolean).join(" · ")) : null;
  add("final", "Final inspections, punch list & clean", Math.max(end(floor), end(mept), end(siding), deck ? end(deck) : 0), 5, "Certificate of occupancy");
  return finishProgram(acts, WEEK_US);
}

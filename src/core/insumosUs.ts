// Explosión de insumos para EE.UU. (material takeoff): concreto premezclado en yd³, varilla en barras de 20',
// madera por escuadría (studs precortados y piezas de 16' del armado del modelo), tableros 4x8, siding, tejas
// en bundles, aislante, drywall 4x12, pintura en galones y tubería, con los consumos y desperdicios usuales
// de un contratista. Las cantidades base salen del presupuesto de EE.UU.

import { budget, defaultBudget } from "./budget";
import { framing, framingTakeoff } from "./framing";
import type { Insumo } from "./insumos";
import type { Project } from "./model";
import { FT } from "./units";

export const GROUPS_US = ["Concrete & foundation", "Lumber & framing", "Sheathing & wrap", "Roofing", "Siding & exterior", "Insulation", "Drywall", "Flooring & tile", "Paint", "Plumbing & electrical"];

const up = Math.ceil;
const STOCK = 16;

export function insumosUs(p: Project): Insumo[] {
  const b = budget(p, p.budget ?? defaultBudget()), items = b.chapters.flatMap((c) => c.items);
  const q = (code: string) => items.find((i) => i.code === code)?.qty ?? 0;
  const out: Insumo[] = [];
  const add = (group: string, name: string, unit: string, qty: number, note: string) => { if (qty > 1e-6) out.push({ group, name, unit, qty: Math.round(qty * 100) / 100, note }); };
  const G = GROUPS_US;

  // concrete: 16"×8" footing, 12"×8" thickened edge, 4" slab, 5 % waste
  const ftg = q("01.02"), thick = q("01.03"), slab = q("02.01");
  const yd = ((ftg * (16 * 8)) / 144 + (thick * (12 * 8)) / 144 + slab / 3) / 27;
  add(G[0], "Ready-mix concrete 3,000 psi", "yd³", up(yd * 1.05 * 4) / 4, `${up(ftg)} LF footing, ${up(slab)} sq ft slab, 5 % waste`);
  add(G[0], "#4 rebar, 20' bars", "ea", up(((ftg * 2 + thick * 2) * 1.1) / 20), "2 continuous bars in footings, 10 % lap and waste");
  add(G[0], "Welded wire mesh 6×6 W1.4, 5'×10' sheets", "ea", up((slab * 1.1) / 50), "slab reinforcing, 10 % lap");
  add(G[0], "10 mil vapor retarder, 10'×100' roll", "roll", up((slab * 1.1) / 1000), "under slab");
  add(G[0], "Gravel base ¾\" crushed stone, 4\"", "yd³", up((slab / 3 / 27) * 1.1), "under slab");
  add(G[0], "Anchor bolts ½\"×10\" with washers", "ea", up(ftg / 6) + 8, "at 6' o.c. and 12\" from plate ends");

  // lumber from the framing model: studs by count, everything else in 16' pieces
  try {
    for (const r of framingTakeoff(framing(p))) {
      const m = /(\d+x\d+)/.exec(r.size);
      if (!m || r.kind === "footing") continue;
      const lf = r.length / FT, pt = /P\.T\./.test(r.size);
      if (r.kind === "stud") add(G[1], `${m[1]} stud, precut`, "ea", up(r.count * 1.1), `${r.count} studs in the model, 10 % waste`);
      else add(G[1], `${pt ? "Pressure-treated " : ""}${m[1]} × ${STOCK}' (${r.kind.replace(/([A-Z])/g, " $1").toLowerCase()})`, "ea", up((lf * 1.1) / STOCK), `${up(lf)} LF, 10 % waste`);
    }
  } catch { /* sin armado en el modelo */ }
  const truss = q("03.04");
  add(G[1], "Framing nails 16d and 8d, 50 lb box", "box", up((q("03.01") + q("03.02") + truss) / 2000), "framing and sheathing");
  add(G[1], "Hurricane ties, hold-downs and joist hangers (allowance)", "ls", truss ? 1 : 0, "per structural details");

  // sheathing
  add(G[2], "7/16\" OSB wall sheathing 4×8", "sheet", up((q("03.01") * 1.1) / 32), "exterior walls, 10 % waste");
  add(G[2], "7/16\" OSB roof sheathing 4×8 with H-clips", "sheet", up((truss * 1.1) / 32), "roof, 10 % waste");
  add(G[2], "¾\" T&G subfloor 4×8 and subfloor adhesive", "sheet", up((q("02.02") * 1.08) / 32), "framed floors, 8 % waste");
  add(G[2], "House wrap 9'×150' roll and cap nails", "roll", up((q("05.01") * 1.15) / 1350), "exterior walls");

  // roofing: 3 bundles per square, synthetic underlayment 10 SQ rolls
  const sq = q("04.01");
  add(G[3], "Architectural shingles (3 bundles per SQ)", "bundle", up(sq * 1.1 * 3), `${sq.toFixed(1)} SQ, 10 % waste`);
  add(G[3], "Synthetic underlayment, 10 SQ roll", "roll", up((sq * 1.1) / 10), "");
  add(G[3], "Ice & water shield, 2 SQ roll", "roll", up(q("04.03") / 65), "along eaves");
  add(G[3], "Drip edge 10'", "ea", up((q("04.03") * 1.1) / 10), "eaves and rakes");
  add(G[3], "Roofing nails 1¼\", 50 lb box", "box", up(sq / 15), "");
  add(G[3], "TPO membrane 60 mil", "sq ft", up(q("04.02") * 1.1), "low-slope roofs");
  add(G[3], "Gutter and downspout", "LF", up(q("04.03")), "");

  // siding: 8¼" lap at 7" exposure, 12' planks cover 7 sq ft
  const sid = q("05.01");
  add(G[4], "Fiber-cement lap siding 8¼\" × 12'", "ea", up((sid * 1.1) / 7), `${up(sid)} sq ft net, 10 % waste`);
  add(G[4], "Fiber-cement trim 1×4 × 12'", "ea", up(sid / 40), "corners and openings");
  add(G[4], "Exterior caulk, 10 oz tube", "ea", up(sid / 60), "");

  // insulation
  add(G[5], "R-21 kraft batts 15\"×93\", bag of 77.5 sq ft", "bag", up((q("05.02") * 1.05) / 77.5), "exterior walls");
  add(G[5], "Blown fiberglass for R-49, bag", "bag", up(q("05.03") / 40), "attic, about 40 sq ft per bag");

  // drywall: 4×12 sheets, compound, tape, screws
  const board = q("12.01");
  add(G[6], "½\" gypsum board 4×12 (moisture-resistant at baths)", "sheet", up((board * 1.1) / 48), `${up(board)} sq ft, 10 % waste`);
  add(G[6], "All-purpose joint compound, 4.5 gal pail", "pail", up(board / 450), "");
  add(G[6], "Paper joint tape, 500' roll", "roll", up(board / 1250), "");
  add(G[6], "Drywall screws 1¼\", 5 lb box", "box", up(board / 1000), "");
  add(G[6], "Cement backer board ½\" 3×5", "sheet", up(((q("08.02") + q("12.02")) * 1.1) / 15), "under tile");

  // flooring & tile
  add(G[7], "Luxury vinyl plank, 20 sq ft carton", "carton", up((q("08.01") * 1.08) / 20), "8 % waste");
  add(G[7], "Porcelain floor tile", "sq ft", up(q("08.02") * 1.1), "10 % waste");
  add(G[7], "Ceramic wall tile", "sq ft", up(q("12.02") * 1.1), "tub / shower surrounds and backsplash");
  add(G[7], "Modified thinset, 50 lb bag", "bag", up((q("08.02") + q("12.02")) / 90), "");
  add(G[7], "Base and casing, primed MDF 16'", "ea", up((q("12.04") * 1.1) / 16), "");

  // paint: 350 sq ft per gallon per coat
  const pa = q("12.03");
  add(G[8], "Interior primer", "gal", up(pa / 350), "1 coat");
  add(G[8], "Interior latex paint, eggshell", "gal", up((pa * 2) / 350), "2 coats");
  add(G[8], "Exterior acrylic paint", "gal", up((q("12.05") * 2) / 350), "2 coats on siding and trim");

  // plumbing & electrical
  add(G[9], "NM-B 12/2 and 14/2 cable, 250' roll", "roll", up((q("09.90") * 1.15) / 250), "branch circuits");
  add(G[9], "PEX-A ½\" and ¾\" tubing", "LF", up((q("10.91") + q("10.92")) * 1.1), "cold and hot water");
  add(G[9], "PVC DWV pipe 2\"–4\" × 10'", "ea", up((q("10.93") * 1.1) / 10), "drain, waste and vent");
  return out;
}

// Project narrative: la memoria descriptiva en inglés para un permiso en EE.UU., con los mismos datos del
// modelo (áreas en sq ft, sistema wood frame, cimentación, cubierta, puertas y ventanas, MEP, revisión IRC,
// códigos y notas generales) y las firmas del despacho.

import { MEP_US } from "./budgetUs";
import { checkProject, RULES_US } from "./codeCheck";
import type { Block, Doc } from "./docx";
import { dwvLoad } from "./dwv";
import { foundationType } from "./foundation";
import type { Project } from "./model";
import { officeOf } from "./office";
import { openingStyle } from "./openingStyles";
import { hvac, projectAreas, roofFraming } from "./permit";
import { CODES, DESIGN_CRITERIA, GENERAL_NOTES } from "./permitNotes";
import { computeRooms } from "./rooms";
import { mepSchedule, openingSchedule, wallSchedule } from "./schedules";
import { stairSteps } from "./stairs";
import { feetInches, FT, IN } from "./units";
import { wallType } from "./wallTypes";

const SF = FT * FT;
const sf = (m2: number) => `${Math.round(m2 / SF).toLocaleString("en-US")} sq ft`;
const NUM = ["zero", "one", "two", "three", "four", "five", "six"];
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const date = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return isNaN(+d) ? iso : d.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
};
const WALL_EN: Record<string, string> = {
  "us-2x6": "2x6 wood studs @ 16\" o.c., 7/16\" OSB sheathing, R-21 batts, 1/2\" gypsum board",
  "us-2x4": "2x4 wood studs @ 16\" o.c., 1/2\" gypsum board each side",
  "us-cmu8": "8\" CMU, grouted cells with vertical reinforcing",
};
const ROOF_EN: Record<string, string> = { flat: "low-slope roof", gable: "gable roof", hip: "hip roof", shed: "shed roof", mansard: "mansard roof", gambrel: "gambrel roof" };
const TOPIC_EN: Record<string, string> = { "Altura": "Ceiling height", "Escalera": "Stairway", "Escape": "Emergency escape opening", "Iluminación": "Natural light", "Lado libre": "Minimum dimension", "Puerta": "Door", "Ventilación": "Natural ventilation", "Área": "Minimum area" };

export function narrative(p: Project): Doc {
  const info = p.info, B: Block[] = [], areas = projectAreas(p), ft = foundationType(p);

  // 1. project information
  B.push({ h: "1. Project information" });
  B.push({ table: [
    ["Project", info.name || "New single-family residence"],
    ["Owner", info.client || "—"],
    ["Site address", info.site?.address || "—"],
    ["Designer", info.author || "—"],
    ["Date", date(info.date)],
    ...DESIGN_CRITERIA.slice(0, 2).map(([k, v]) => [k.charAt(0) + k.slice(1).toLowerCase(), v]),
    ["Stories", String(p.levels.length)],
    ["Conditioned living area", sf(areas.living)],
    ["Building footprint", sf(areas.footprint)],
  ], widths: [1, 2.4] });

  // 2. description
  B.push({ h: "2. Project description" });
  const beds = p.levels.reduce((t, l) => t + l.rooms.filter((r) => /bed/i.test(r.name)).length, 0);
  const baths = p.levels.reduce((t, l) => t + l.rooms.filter((r) => /bath/i.test(r.name)).length, 0);
  B.push({ p: `New ${NUM[p.levels.length] ?? p.levels.length}-story single-family residence of ${sf(areas.living)} of conditioned living area${beds ? `, with ${beds} bedroom${beds > 1 ? "s" : ""}` : ""}${baths ? ` and ${baths} bathroom${baths > 1 ? "s" : ""}` : ""}, wood frame construction on a ${ft.en.toLowerCase()} foundation.` });
  for (const lv of p.levels) {
    const g = computeRooms(lv), names = lv.rooms.filter((r) => g?.rooms.get(r.id)?.ok).map((r) => r.name);
    if (names.length) B.push({ p: `${lv.name}: ${list(names)}.` });
  }
  const stairs = p.levels.flatMap((l) => l.stairs);
  if (stairs.length) {
    const s = stairSteps(stairs[0]);
    B.push({ p: `Levels are connected by a ${feetInches(stairs[0].width)} wide stairway with ${s.n} risers of ${(s.riser / IN).toFixed(2)}" and treads of ${(s.tread / IN).toFixed(2)}" (IRC R311.7).` });
  }

  // 3. area summary
  B.push({ h: "3. Area summary" });
  const rows: string[][] = [["Level", "Space", "Area (sq ft)"]];
  for (const lv of p.levels) {
    const g = computeRooms(lv);
    for (const r of lv.rooms) { const c = g?.rooms.get(r.id); if (c?.ok) rows.push([lv.name, r.name, Math.round(c.area / SF).toLocaleString("en-US")]); }
  }
  for (const l of areas.levels) rows.push([l.name, "Gross floor area", Math.round(l.gross / SF).toLocaleString("en-US")]);
  rows.push(["Total", "Conditioned living area", Math.round(areas.living / SF).toLocaleString("en-US")]);
  B.push({ table: rows, head: true, total: true, widths: [1.2, 2.4, 1] });

  // 4. construction
  B.push({ h: "4. Construction" });
  B.push({ h: "Foundation", level: 2 });
  B.push({ p: `${ft.en}. Concrete f'c = 3,000 psi min; footings bear on undisturbed soil or compacted fill at 1,500 psf presumptive bearing (IRC R401.4), below the local frost depth. Sill plates pressure-treated with 1/2" anchor bolts at 6'-0" o.c. max and 12" from plate ends (IRC R403.1.6).` });
  B.push({ h: "Walls", level: 2 });
  const walls = wallSchedule(p);
  const typeOf = new Map(p.levels.flatMap((l) => l.walls).map((w) => [w.type, wallType(w.type)]));
  if (walls.length) {
    const t = [...typeOf.values()];
    B.push({ table: [["Wall type", "Assembly", "Length", "Net area"], ...walls.map((w) => {
      const wt = t.find((x) => x.material === w.material);
      return [wt?.id.startsWith("us-") ? wt.id.replace("us-", "").toUpperCase() : w.type, (wt && WALL_EN[wt.id]) || w.material, `${Math.round(w.length / FT)} LF`, sf(w.area)];
    })], head: true, widths: [0.8, 2.6, 0.8, 0.9] });
  }
  B.push({ p: "Wall bracing per IRC R602.10 with continuous OSB structural sheathing; headers per IRC Table R602.7(1); top plates doubled and lapped; fireblocking per R302.11." });
  const roofs = p.levels.flatMap((l) => l.roofs);
  if (roofs.length) {
    B.push({ h: "Roof", level: 2 });
    const kinds = [...new Set(roofs.map((r) => ROOF_EN[r.kind] ?? r.kind))], pitched = roofs.find((r) => r.kind !== "flat");
    const rf = p.levels.flatMap((l) => roofFraming(l))[0];
    const rise = pitched ? Math.round(Math.tan((pitched.pitch * Math.PI) / 180) * 12) : 0;
    B.push({ p: `${list(kinds).replace(/^./, (c) => c.toUpperCase())}${pitched ? ` at ${rise}:12 with ${feetInches(pitched.overhang)} overhangs` : ""}, framed with ${rf && !rf.flat ? `${rf.member.toLowerCase()} rafters and ${/ridge/i.test(rf.ridge) ? rf.ridge.toLowerCase() : `${rf.ridge.toLowerCase()} ridge`}, or engineered trusses (deferred submittal),` : "engineered framing"} and 7/16" OSB sheathing. ${pitched ? "Class A architectural asphalt shingles over synthetic underlayment with ice barrier at eaves where required (IRC R905.2)." : "Single-ply membrane over tapered insulation (IRC R905.13)."} Attic ventilation per IRC R806; ceiling insulation R-49 per IECC Table R402.1.3.` });
  }

  // 5. doors and windows
  const doors = openingSchedule(p, "door").types, wins = openingSchedule(p, "window").types;
  if (doors.length || wins.length) {
    B.push({ h: "5. Doors and windows" });
    const ro = [["Mark", "Type", "Size (W × H)", "Qty"]];
    for (const d of [...doors, ...wins]) ro.push([d.mark, openingStyle({ kind: d.kind, style: d.style }).en ?? openingStyle({ kind: d.kind, style: d.style }).name, `${feetInches(d.width)} × ${feetInches(d.height)}`, String(d.count)]);
    B.push({ table: ro, head: true, widths: [0.7, 2.2, 1.3, 0.7] });
    B.push({ p: "Windows vinyl, double-pane Low-E, U-factor 0.30 max (IECC R402.1.2), installed and flashed per manufacturer and ASTM E2112. Safety glazing at hazardous locations (IRC R308). Exterior doors insulated fiberglass with weatherstripping and deadbolt." });
  }

  // 6. MEP
  B.push({ h: "6. Mechanical, electrical and plumbing" });
  const named = (rows: { kind: string; count: number }[]) => rows.map((r) => `${(MEP_US[r.kind]?.[0] ?? r.kind).replace(/,.*$/, "").toLowerCase()} (${r.count})`);
  const el = mepSchedule(p, "elec"), pl = mepSchedule(p, "plum"), d = dwvLoad(p);
  B.push({ h: "Electrical", level: 2 });
  B.push({ p: `200 A, 120/240 V single-phase service with main panel; branch circuits in NM-B copper cable per NEC 2020, AFCI protection per NEC 210.12 and GFCI per NEC 210.8, tamper-resistant receptacles. Smoke and CO alarms hard-wired and interconnected (IRC R314, R315).${el.length ? ` Includes ${list(named(el))}.` : ""}` });
  B.push({ h: "Plumbing", level: 2 });
  B.push({ p: `Water distribution in PEX with 3/4" main and 1/2" branches; tank water heater 50 gal. DWV in Schedule 40 PVC, horizontal drains sloped 1/4" per foot, every trap vented, cleanouts per IRC P3005.2.${d.rows.length ? ` Drainage load ${d.total} DFU; building drain ${d.drain} (IRC P3005.4.2).` : ""}${pl.length ? ` Includes ${list(named(pl))}.` : ""}` });
  B.push({ h: "Mechanical", level: 2 });
  const tons = Math.max(0, ...p.levels.map((l) => hvac(l)?.tons ?? 0));
  B.push({ p: `${tons ? `${tons} ton split system heat pump or furnace with condenser` : "Split system heat pump"}, sized per ACCA Manual J/S with ducts per Manual D (IRC M1401.3, M1601.1); duct leakage tested per IECC R403.3. Bath exhaust fans 50 cfm min and kitchen hood vented to the exterior (IRC M1505).` });

  // 7. code review
  const chk = checkProject(p), errs = chk.findings.filter((f) => f.sev === "error");
  B.push({ h: "7. Code compliance review" });
  B.push({ p: errs.length
    ? `${chk.checks} conditions were reviewed in ${chk.rooms.length} spaces under the 2021 IRC; ${errs.length} do${errs.length > 1 ? "" : "es"} not comply and will be corrected before submittal:`
    : `${chk.checks} conditions were reviewed in ${chk.rooms.length} spaces under the 2021 IRC (minimum room areas and dimensions R304, ceiling height R305, light and ventilation R303, emergency escape R310, doors, hallways and stairways R311) and all comply.` });
  if (errs.length) B.push({ list: errs.map((f) => `${f.where} (${p.levels[f.level].name}): ${TOPIC_EN[f.topic] ?? f.topic}${/R\d{3}[\d.]*/.exec(f.msg) ? `, IRC ${/R\d{3}[\d.]*/.exec(f.msg)![0].replace(/\.$/, "")}` : ""}.`) });
  if (chk.rooms.length) B.push({ table: [["Space", "Use", "Area (sq ft)", "Min. dim.", "Glazing"], ...chk.rooms.map((r) => [r.name, RULES_US[r.use].label, String(Math.round(r.area / SF)), feetInches(r.side), r.area ? `${Math.round((r.glass / r.area) * 100)} %` : ""])], head: true, widths: [1.6, 1.4, 0.8, 0.8, 0.8] });

  // 8. codes and notes
  B.push({ h: "8. Applicable codes" });
  B.push({ list: CODES });
  B.push({ h: "9. General notes" });
  for (const g of GENERAL_NOTES) { B.push({ h: g.title, level: 2 }); B.push({ list: g.notes }); }

  B.push({ h: "Responsible parties" });
  const of = officeOf(p);
  B.push({ signs: [
    { role: of?.license ? `Designer · License ${of.license}` : "Designer", name: of?.responsible || info.author },
    { role: "Owner", name: info.client },
  ] });

  return { title: "Project narrative", subtitle: `${info.name || "New single-family residence"}${info.client ? ` · ${info.client}` : ""}`, blocks: B };
}

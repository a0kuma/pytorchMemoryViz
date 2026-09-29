// Verify the phenomenon's cause via the 2x2 cases from gen_cases.py.
// For each case, run the real process_alloc_data and report:
//   RED   = does the minimap (max_at_time) ever decrease?
//   GREEN = does any block recompact (its offset decreases over time =
//           shift_elements_above ran, i.e. an interior free)?
// Run:  python3 gen_cases.py  &&  node analyze_cases.mjs
import { readFile } from "node:fs/promises";
const here = new URL(".", import.meta.url);
const src = await readFile(new URL("../../process_alloc_data.js", here), "utf8");
const { process_alloc_data } = await import("data:text/javascript," + encodeURIComponent(src));

const cases = ["case_interior_realloc", "case_interior_norealloc",
               "case_top_realloc", "case_top_norealloc"];
console.log("case                     | RED minimap dips? | GREEN recompaction notch? | max_at_time");
for (const c of cases) {
  const snap = JSON.parse(await readFile(new URL(`./cases/${c}.json`, here), "utf8"));
  if (!snap.categories) snap.categories = [];
  const d = process_alloc_data(snap, 0, false, 15000, false);
  const num = v => typeof v === "bigint" ? Number(v) : v;
  const M = d.max_at_time.map(num);
  const redDips = M.some((v, i) => i > 0 && v < M[i - 1]);
  let greenNotch = false;
  for (const e of d.allocations_over_time) {
    if (e.elem === "summarized") continue;
    const offs = e.offsets.map(num);
    if (offs.some((v, i) => i > 0 && v < offs[i - 1])) { greenNotch = true; break; }
  }
  console.log(`${c.padEnd(24)} |       ${redDips ? "YES" : "no "}         |          ${greenNotch ? "YES" : "no "}            | [${M.join(",")}]`);
}

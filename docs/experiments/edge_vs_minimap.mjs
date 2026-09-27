// EXPERIMENT: is the top edge of the main stacked plot the same as the minimap?
//
// The main plot (MemoryPlot) draws one <polygon> per allocation, stacked; its
// UPPER EDGE at each timestep is the total active memory. The minimap (MiniMap)
// draws data.max_at_time as a step-area. Both should be "total memory over
// time" -- this script checks whether they are numerically identical.
//
// Reproduce:  node docs/experiments/edge_vs_minimap.mjs
// (Loaded via a data: URL so it works despite package.json "type":"commonjs".)
import { readFile, writeFile } from "node:fs/promises";

const here = new URL(".", import.meta.url);
const src = await readFile(new URL("../../process_alloc_data.js", here), "utf8");
const { process_alloc_data } = await import("data:text/javascript," + encodeURIComponent(src));
const snap = JSON.parse(await readFile(new URL("../../tests/snapshot.json", here), "utf8"));
if (!snap.categories) snap.categories = [];

const d = process_alloc_data(snap, 0, false, 15000, false);
const aot = d.allocations_over_time, M = d.max_at_time, N = M.length, MAX = d.max_size;
const sz = (e, i) => Array.isArray(e.size) ? e.size[i] : e.size;

// Top of one element's drawn polygon at (possibly fractional) timestep t.
// SVG <polygon> edges are straight lines between vertices, so we linearly
// interpolate between the element's recorded vertices -- exactly what is drawn.
function topAt(e, t) {
  const ts = e.timesteps;
  if (t < ts[0] || t > ts[ts.length - 1]) return null;
  for (let i = 0; i < ts.length - 1; i++) {
    if (t >= ts[i] && t <= ts[i + 1]) {
      const span = ts[i + 1] - ts[i] || 1, f = (t - ts[i]) / span;
      return e.offsets[i] + (e.offsets[i + 1] - e.offsets[i]) * f
           + sz(e, i) + (sz(e, i + 1) - sz(e, i)) * f;
    }
  }
  return null;
}
const envelope = t => { let m = 0; for (const e of aot) { const tp = topAt(e, t); if (tp != null && tp > m) m = tp; } return m; };

// Compare at every integer timestep (where max_at_time is defined).
let maxErr = 0, worst = -1, exact = 0;
const rows = [];
for (let t = 0; t < N; t++) {
  const env = envelope(t), mm = M[t], diff = env - mm;
  if (Math.abs(diff) > maxErr) { maxErr = Math.abs(diff); worst = t; }
  if (diff === 0) exact++;
  if (diff !== 0) rows.push({ t, envelope: Math.round(env), minimap: mm, diff_bytes: Math.round(diff), diff_MiB: +(diff / 1048576).toFixed(3) });
}
console.log(`timesteps=${N}  exact matches=${exact}/${N}  divergences=${rows.length}`);
console.table(rows);
console.log(`peak (max_size, both y-domains) = ${(MAX / 1048576).toFixed(1)} MiB`);
console.log(`max |edge - minimap| = ${maxErr} bytes = ${(maxErr / 1048576).toFixed(3)} MiB = ${(100 * maxErr / MAX).toFixed(3)}% of peak (worst @t=${worst})`);
console.log(maxErr === 0
  ? "=> IDENTICAL"
  : "=> SAME CURVE, NOT IDENTICAL: they diverge only at event/gap timesteps, because the\n" +
    "   main plot connects event-timestep vertices with straight (slanted) edges while the\n" +
    "   minimap is a pure per-timestep STEP of max_at_time.");

// Emit the overlay data used to render envelope_vs_minimap.png (optional).
if (process.argv.includes("--emit")) {
  const step = []; for (let t = 0; t < N; t++) step.push([t, M[t]]);
  const edge = []; for (let t = 0; t <= N - 1; t += 0.25) edge.push([+t.toFixed(2), Math.round(envelope(t))]);
  await writeFile(new URL("./overlay_data.json", here), JSON.stringify({ N, MAX, minimap_step: step, main_edge_interp: edge }, null, 0));
  console.log("wrote overlay_data.json");
}

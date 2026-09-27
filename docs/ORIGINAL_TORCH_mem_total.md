# Does the ORIGINAL torch code show a memory-total in the plot?

Analysis of the upstream source only — `pytorch/pytorch@main`
`torch/utils/viz/MemoryViz.js` + `process_alloc_data.js` — **not** a0kuma's
modified copy.

## Correction

The red dashed **vertical** line (peak marker) and the "Download peak allocs"
buttons are **a0kuma local additions**, not torch. The original torch code has
neither. Verified on the rendered original UI: `svg line` with red vertical
stroke = **0**, `stroke-dasharray` elements in the plot = **0**.

## Answer: yes — total memory over time IS in the original, as filled area (never a line)

The original torch UI represents total memory over time in two places, but it
**never draws it as an explicit stroked line/curve**:

1. **The minimap (dedicated total-memory-vs-time visual).**
   `MiniMap()` (MemoryViz.js:1049, called at :1207) takes `data.max_at_time`
   and renders it as a **filled step-area `<polygon>`** (blue,
   `schemeTableau10[0]`) — the strip below the main plot.
   `max_at_time[i] = total_mem + total_summarized_mem` at timestep `i`
   (process_alloc_data.js:567), i.e. the running total of active memory. This
   is the closest thing to a "memory total" trace, and it is torch-original.

2. **The main stacked-area plot (total shown implicitly).**
   `MemoryPlot()` (MemoryViz.js:864) draws one filled `<polygon>` per
   allocation, stacked. The **upper envelope of the stack equals total memory**
   at each timestep — so the total is visible as the silhouette, but there is
   no separate total line drawn.

## What is NOT in the original

- No red dashed vertical peak-timestep line (a0kuma-only).
- No `<path>`/`<line>` stroke tracing total or cumulative memory.
- No per-step "increment" line.

So "mem total in plot": **present as filled areas** (minimap step-area +
stacked-plot silhouette), **not** as a line, and with **no** peak marker.

See `orig_torch_ux.png` — the original torch UI rendered from a real snapshot
(note: no red line; blue filled minimap = total memory over time).

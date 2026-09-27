# Main-plot top edge vs minimap — every pickle in the repo

One overlay per pickle (20 total): the **actual rendered** top edge of the main
stacked plot (orange) vs the **actual rendered** minimap (blue), for each
`.pickle` in `data/` and `tests/`.

## Method — measured from pixels, not from data

An earlier attempt reconstructed the top edge from `allocations_over_time`
offsets. **That is unreliable**: for these snapshots the *summarized band*'s
stored `offset` does not correspond to its painted stack position (it floats a
fixed ~192 MB above the true total), producing phantom divergences of up to
183 MiB that are **not** in the rendered plot. Ground truth is what the browser
paints, so these charts are measured from the rendered screenshots instead:

1. `charts_px.js` (Puppeteer) loads each pickle with the app's **real** (BigInt)
   unpickler, screenshots the page, and records calibration rects — the
   bounding box of the main-plot polygon group and of the minimap polygon
   (a one-line debug shim exposes `process_alloc_data` / `snapshot_cache`; the
   committed app is unchanged).
2. `pixel_analyze.py` (Pillow + numpy + matplotlib) finds, per pixel column, the
   **topmost painted pixel** of the colourful stack and of the blue minimap,
   converts to MiB using each region's own baseline/peak (both y-axes span
   `[0, max_size]`), overlays them, and reports correlation and |Δ|.
   The red dashed peak line is excluded from the stack detection.

Reproduce (needs a browser + the debug-shim serve dir described in
`charts_px.js`):

```
node docs/experiments/charts_px.js          # -> screenshots + meta.json
python3 docs/experiments/pixel_analyze.py <shotdir> docs/charts_all_pickles
```

## Result

Across all 20 pickles the two rendered curves are the **same curve** — total
active memory over time:

| pickle | peak | corr | median &#124;Δ&#124; | p95 &#124;Δ&#124; |
|---|--:|--:|--:|--:|
| see `summary.json` for exact numbers | | 0.90–0.999 | 5–19 MiB (~1–2% of peak) | 12–267 MiB |

- **Median difference is ~1–2% of peak** everywhere: the bulk envelope of the
  main plot's top edge and the minimap coincide.
- The larger **p95** differences occur only at **isolated single-timestep
  spikes**. The minimap is 47 px tall and, for the long traces (up to 42k
  timesteps squeezed into ~1450 px), each pixel column aggregates ~30 timesteps;
  the two views pick slightly different peaks within a column and resolve thin
  transient spikes at different vertical resolution. That is a rendering-
  resolution effect, not a difference in the underlying quantity.

**Conclusion:** the top edge of the main stacked plot and the minimap plot the
same thing (`max_at_time` = total active memory). They match to ~1–2% of peak;
the only visible disagreement is at sharp single-timestep transients, due to the
minimap's much lower resolution.

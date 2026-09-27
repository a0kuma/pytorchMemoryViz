#!/usr/bin/env python3
# Measure the REAL painted top edge of the main stacked plot and of the minimap
# from the rendered screenshots, and overlay them. No data reconstruction:
# every value comes from pixels the browser actually painted.
import json, os, sys
import numpy as np
from PIL import Image
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

SHOTDIR = sys.argv[1]
OUTDIR  = sys.argv[2]
os.makedirs(OUTDIR, exist_ok=True)
meta = json.load(open(os.path.join(SHOTDIR, "meta.json")))

def hsv_arrays(rgb):
    r, g, b = rgb[..., 0]/255., rgb[..., 1]/255., rgb[..., 2]/255.
    mx = np.maximum(np.maximum(r, g), b); mn = np.minimum(np.minimum(r, g), b)
    v = mx; s = np.where(mx > 0, (mx-mn)/np.maximum(mx, 1e-9), 0)
    return s, v, r, g, b

def top_edge(arr, rect, kind):
    # arr: HxWx3 uint8. Returns (time_frac[], frac_of_peak[]) for painted top.
    L = int(np.ceil(rect["left"]))+1; R = int(np.floor(rect["right"]))-1
    T = max(0, int(np.floor(rect["top"]))-2); B = min(arr.shape[0]-1, int(np.ceil(rect["bottom"]))+2)
    H = rect["bottom"] - rect["top"]
    xs, fr = [], []
    s, v, r, g, b = hsv_arrays(arr)
    for x in range(L, R):
        col_s = s[T:B, x]; col_v = v[T:B, x]
        if kind == "main":
            # stack colour: saturated & bright; exclude the red dashed peak line
            red = (r[T:B, x] > 0.78) & (g[T:B, x] < 0.35) & (b[T:B, x] < 0.35)
            paint = (col_s > 0.18) & (col_v > 0.25) & (~red)
        else:  # minimap: single steel-blue fill (b dominant)
            paint = (b[T:B, x] > r[T:B, x] + 0.05) & (b[T:B, x] > g[T:B, x] + 0.02) & (col_v > 0.25)
        idx = np.argmax(paint)
        if not paint.any():
            continue
        y = T + idx
        xs.append((x - rect["left"]) / rect["width"])
        fr.append((rect["bottom"] - y) / H)   # 0 at baseline, 1 at max_size
    return np.array(xs), np.array(fr)

def resample(xf, yf, grid):
    if len(xf) < 3:
        return np.full_like(grid, np.nan)
    order = np.argsort(xf); xf, yf = xf[order], yf[order]
    xf, uniq = np.unique(xf, return_index=True); yf = yf[uniq]
    return np.interp(grid, xf, yf, left=yf[0], right=yf[-1])

grid = np.linspace(0, 1, 1000)
rows = []
for m in meta:
    arr = np.asarray(Image.open(m["shot"]).convert("RGB"))
    mx, mf = top_edge(arr, m["plotRect"], "main")
    nx, nf = top_edge(arr, m["miniRect"], "mini")
    peak = m["MAX"]/1048576.0
    main = resample(mx, mf, grid)*peak
    mini = resample(nx, nf, grid)*peak
    ok = ~np.isnan(main) & ~np.isnan(mini)
    corr = float(np.corrcoef(main[ok], mini[ok])[0, 1]) if ok.sum() > 3 else float("nan")
    med = float(np.nanmedian(np.abs(main-mini))); p95 = float(np.nanpercentile(np.abs(main-mini), 95))
    name = m["pickle"]

    fig, ax = plt.subplots(figsize=(12.8, 4.2), dpi=100)
    t = grid  # time fraction 0..1
    ax.fill_between(t, 0, mini, color="#4e79a7", alpha=0.25, label="minimap (rendered)")
    ax.plot(t, mini, color="#4e79a7", lw=2.5, alpha=0.6)
    ax.plot(t, main, color="#f28e2b", lw=1.3, label="main-plot top edge (rendered)")
    ax.set_xlim(0, 1); ax.set_ylim(0, peak*1.05)
    ax.set_xlabel(f"time (fraction of {m['N']} timesteps)"); ax.set_ylabel("MiB")
    ax.set_title(f"{name}  (device {m['device']})   peak {peak:.1f} MiB   "
                 f"corr={corr:.4f}  median|Δ|={med:.2f} MiB  p95|Δ|={p95:.2f} MiB", fontsize=10)
    ax.legend(loc="upper right", fontsize=9); ax.grid(alpha=0.15)
    out = os.path.join(OUTDIR, name.replace("/", "__").replace(".pickle", "") + ".png")
    fig.tight_layout(); fig.savefig(out); plt.close(fig)
    rows.append(dict(pickle=name, device=m["device"], timesteps=m["N"], peakMiB=round(peak,1),
                     corr=round(corr,4), median_abs_MiB=round(med,2), p95_abs_MiB=round(p95,2)))
    print(f"{name:52s} corr={corr:.4f} med|Δ|={med:5.2f}MiB p95|Δ|={p95:6.2f}MiB")

json.dump(rows, open(os.path.join(OUTDIR, "summary.json"), "w"), indent=2)
print("\nwrote", len(rows), "overlays to", OUTDIR)

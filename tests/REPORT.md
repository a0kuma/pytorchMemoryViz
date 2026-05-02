# Restoring `peak_timestep` / `peak_alloc_events` in `process_alloc_data`

> Companion to PR #3 (`cUZpARuPDATE`). The PR description says:
>
> > *"for the viz js i want both func in the main branch and the cUZpARuPDATE — cuz in the main branch have a func is to find max i would like to keep that"*
>
> This branch keeps **both** sides: PR #3's modular `process_alloc_data.js` (with `isPrivatePoolId`, the new `include_private_inactive` arg, the `segment_pool_id` parameter, etc.) **and** main's "find max" logic that PR #3 dropped (`peak_timestep`, `peak_alloc_events`, the wall-clock peak log).

## What main had that PR #3 dropped

`main`'s `process_alloc_data` returned:

```js
{ max_size, peak_timestep, peak_alloc_events, allocations_over_time,
  max_at_time, summarized_mem, elements_length, context_for_id }
```

PR #3's restructured `process_alloc_data` returns:

```js
{ max_size,                                allocations_over_time,
  max_at_time, summarized_mem, elements_length, context_for_id }
```

i.e. `peak_timestep` and `peak_alloc_events` were silently lost when the function moved into `process_alloc_data.js`. The accompanying "Peak active memory: <size> at <date>" console log was also dropped.

These aren't cosmetic — `MemoryPlot` (in `MemoryViz.js`) draws a red dashed "peak" line through the timeline; the blocks at that timestep are `peak_alloc_events`. Without them the renderer falls back to whatever derivation it can do downstream, and the wall-clock report is just gone.

## What this branch restores (without removing PR #3 features)

Diff scope: **`process_alloc_data.js` only**, +62 / −2.

1. **`let peak_elem = null;`** declared next to `let max_size = 0;`.
2. The two `max_size = Math.max(...)` updates **inside the action loop** become explicit if-blocks that also set `peak_elem = elem` when the new total exceeds the running max. (The third `max_size` update sits in the post-loop segment-events `while`, where there is no `elem` in scope; that one is left as `Math.max(...)` and `peak_elem` keeps the last meaningful action's value, matching `main`'s semantics.)
3. After the data has been built, compute `peak_timestep` by scanning `max_at_time`, log the peak time line (with date if `time_us` is present, "no timestamp available" otherwise), then derive `peak_alloc_events` by filtering `data` for entries whose `timesteps` straddle the peak.
4. Add `peak_timestep` and `peak_alloc_events` to the return object — exactly the shape `MemoryViz.js` consumers expect from `main`.

Nothing in `MemoryViz.js` is touched. PR #3's other improvements stay intact:

- `process_alloc_data.js` is still the modular, dependency-free file (no d3/DOM imports).
- `isPrivatePoolId`, the `include_private_inactive = false` parameter, the pool envelope tracking, the new `segment_pool_id` param on `Segment`, and the ghost-block context line are all preserved.

## Tests (`tests/`)

The PR #3 source comment on `process_alloc_data.js` already says:

> *"Extracted from MemoryViz.js so they can be tested independently (no d3/DOM deps). … Node.js tests load this file by stripping the export line and eval-ing"*

This branch builds out that hypothetical test harness using **Puppeteer** (per request) and the real `gpu_memory_snapshot-adam.pickle` produced by an Adam-optimizer training run, sent in by email.

```
tests/
├── gpu_memory_snapshot-adam.pickle  ← the example file from the email
├── make_snapshot_json.py            ← one-time pickle → JSON preprocessor for the unit test
├── snapshot.json                    ← preprocessed snapshot, fetched by the unit test
├── test_unit.html                   ← imports process_alloc_data.js, asserts peak_* fields
├── test_integration.html            ← imports MemoryViz.js, lets MemoryViz wire its own
│                                       file input, then waits for the restored console log
└── run.mjs                          ← Puppeteer runner: starts a static HTTP server,
                                       opens both pages, asserts, prints a pass/fail report
```

Run:

```bash
npm install            # one-time: pulls puppeteer into node_modules/
node tests/run.mjs
```

### What gets asserted

| Test | Assertion | Why it matters |
|------|-----------|---------------|
| **unit** | `process_alloc_data` return object includes `peak_timestep` (a non-negative number, < `max_at_time.length`) | Restored field |
| unit | return object includes `peak_alloc_events` (an Array, length > 0 for this snapshot) | Restored field |
| unit | `max_size > 0`, `max_at_time.length > 0`, `context_for_id` is a function | PR #3 features preserved |
| unit | console contains `"Peak active memory:"` | Restored log |
| unit | console contains `"Blocks at peak memory"` | Restored log |
| **integration** | Page can `import { add_local_files } from "../MemoryViz.js"` and load the real pickle through MemoryViz's auto-created file input | End-to-end smoke test that the merged code still parses real snapshots |
| integration | Same two console logs fire after upload | Restored behaviour reaches users |

### Live result on this snapshot

```
✓ unit (process_alloc_data direct)
  result: {"max_size":217763364,"peak_timestep":29,"peak_alloc_events_count":15,
           "max_at_time_length":32,"elements_length":18,
           "has_context_for_id":true,
           "keys":["max_size","peak_timestep","peak_alloc_events",
                   "allocations_over_time","max_at_time","summarized_mem",
                   "elements_length","context_for_id"]}
  peak logs:
    Peak active memory: 207.7MiB (217763364 bytes) at 2026-04-28T08:43:50.760Z (2026/4/28 下午4:43:50)
    Blocks at peak memory (red dashed line): 15

✓ integration (add_local_files end-to-end)
  peak logs:
    Peak active memory: 207.7MiB (217763364 bytes) at 2026-04-28T08:43:50.760Z (2026/4/28 下午4:43:50)
    Blocks at peak memory (red dashed line): 15

========== PASS ==========
```

## Two implementation notes worth flagging

1. **`process_alloc_data` reads `snapshot.categories.length` at line 573**, but `process_alloc_data.js` does not initialise that field — `annotate_snapshot` (still in `MemoryViz.js`) does. So `process_alloc_data` is **not** standalone in spite of its filename suggesting otherwise; calling it directly on a freshly-loaded snapshot crashes with `Cannot read properties of undefined (reading 'length')`. The unit test mirrors what `annotate_snapshot` does to populate `categories` before calling. If the goal is real standalone use, `annotate_snapshot` should also move into `process_alloc_data.js` — out of scope for this PR.

2. **`add_local_files(files, view_value)`** declared in `MemoryViz.js` expects `{ name, base64 }` shapes, not raw `File` objects from `<input type="file">`. The actual file-input change handler that consumes real `File`s and goes through `FileReader → finished_loading → unpickle_and_annotate → annotate_snapshot` is the d3-rendered input MemoryViz creates near line 1727. The integration test relies on that input rather than re-implementing the pipeline.

#!/usr/bin/env python3
# Reproduce the "green drops but red (minimap) does not" phenomenon and verify
# its cause with a controlled 2x2:
#   position in {interior, top}  x  compensating realloc in {yes, no}
# Cause hypothesis:
#   * GREEN notch  = shift_elements_above() recompaction -> needs an INTERIOR free
#   * RED stays flat = max_at_time sampled before `total_mem -= size`, and the
#     freed bytes are re-added by an immediate same-size realloc -> needs the realloc
# Writes cases/<name>.pickle and cases/<name>.json (for analyze_cases.mjs).
import pickle, copy, os, json

HERE = os.path.dirname(os.path.abspath(__file__))
TMPL = pickle.load(open(os.path.join(HERE, "what_i_want_to_do_diff_fwd_and_bkd.pickle"), "rb"))
_alloc = [e for e in TMPL["device_traces"][0] if e["action"] == "alloc"][0]
_seg   = [e for e in TMPL["device_traces"][0] if e["action"] == "segment_alloc"][0]
BASE = 1099985584128
t0 = _alloc["time_us"]

def ev(action, addr, size, i):
    e = copy.deepcopy(_alloc)
    e["action"] = action; e["addr"] = addr; e["size"] = size
    e["time_us"] = t0 + i * 1000
    return e

def build(position, realloc):
    P, Q, T, U, V = BASE, BASE+512, BASE+1024, BASE+1536, BASE+2048
    W = T if position == "interior" else V   # reused address for the realloc
    tr = [copy.deepcopy(_seg)]
    tr[0]["addr"] = BASE; tr[0]["size"] = 2097152
    seq = [("alloc", P, 100), ("alloc", Q, 40), ("alloc", T, 40),
           ("alloc", U, 40), ("alloc", V, 40)]
    tgt = T if position == "interior" else V
    seq += [("free_requested", tgt, 40), ("free_completed", tgt, 40)]
    if realloc:
        seq += [("alloc", W, 40)]
    seq += [("alloc", BASE+4096, 24)]        # trailing alloc -> a sample after the free settles
    for i, (a, addr, sz) in enumerate(seq):
        tr.append(ev(a, addr, sz, i+1))
    return {"segments": copy.deepcopy(TMPL["segments"]),
            "device_traces": [tr],
            "allocator_settings": TMPL["allocator_settings"],
            "external_annotations": TMPL.get("external_annotations", [])}

os.makedirs(os.path.join(HERE, "cases"), exist_ok=True)
for position in ("interior", "top"):
    for realloc in (True, False):
        name = f"case_{position}_{'realloc' if realloc else 'norealloc'}"
        snap = build(position, realloc)
        pickle.dump(snap, open(os.path.join(HERE, "cases", name + ".pickle"), "wb"))
        json.dump(snap, open(os.path.join(HERE, "cases", name + ".json"), "w"))
        print("wrote", name)

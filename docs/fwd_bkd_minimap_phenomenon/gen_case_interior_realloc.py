#!/usr/bin/env python3
"""
Generate case_interior_realloc.pickle by REAL CUDA allocations (no hand-built
dict, no json/base64). PyTorch's caching allocator records the trace and writes
the snapshot; every address, stack frame and segment is genuine.

Workload = the "interior free immediately compensated by an equal alloc":
  - allocate a 5-block stack (sizes 100, 40, 40, 40, 40 bytes)
  - free the 3rd (interior) block
  - IMMEDIATELY allocate an equal-size (40-byte) block -> the caching allocator
    reuses the just-freed block at the same address (total unchanged / flat)
  - one trailing alloc (24 bytes)
"""
import os, torch

DEV = "cuda:0"
torch.cuda.init()
torch.cuda.memory._record_memory_history(max_entries=100000)

def t(nbytes):
    # a float32 tensor whose requested size is exactly `nbytes`
    return torch.empty(nbytes // 4, dtype=torch.float32, device=DEV)

live = [t(100), t(40), t(40), t(40), t(40)]   # 5-block stack; index 2 is interior
old = live.pop(2); del old                     # free the interior block
live.append(t(40))                             # immediately realloc an EQUAL block
live.append(t(24))                             # trailing alloc
torch.cuda.synchronize()

here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, "cases", "case_interior_realloc.pickle")
os.makedirs(os.path.dirname(out), exist_ok=True)
torch.cuda.memory._dump_snapshot(out)
print("wrote", out, os.path.getsize(out), "bytes")

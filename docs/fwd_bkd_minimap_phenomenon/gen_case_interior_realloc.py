#!/usr/bin/env python3
"""
Generate docs/fwd_bkd_minimap_phenomenon/cases/case_interior_realloc.pickle
from scratch, using ONLY plain Python literals (no json, no base64, no
embedded serialized blob). Run:  python3 gen_case_interior_realloc.py

The trace is the minimal 'interior free immediately compensated by an equal
alloc' workload: build a 5-block stack, free the 3rd (interior) block, then
immediately re-allocate an equal-size block at the same address. The total
(minimap) stays flat while the per-block plot shows the recompaction drop.
"""
import pickle, os

BASE   = 1099985584128          # a plausible CUDA device address
T0     = 1790677403279369       # first timestamp (microseconds), monotonic
SEG    = 2097152                # 2 MiB small-pool segment
STREAM = 0
POOL   = (0, 0)

# One representative capture stack, shared by every trace event and block.
FRAMES = [{'filename': '??', 'line': 0, 'name': 'torch::unwind::unwind()'},
 {'filename': '??', 'line': 0, 'name': 'torch::CapturedTraceback::gather(bool, bool, bool)'},
 {'filename': 'memory_snapshot.cpp',
  'line': 0,
  'name': 'torch::cuda::(anonymous namespace)::gather_with_cpp()'},
 {'filename': '',
  'line': 0,
  'name': 'c10::cuda::CUDACachingAllocator::Native::NativeCachingAllocator::malloc(void**, signed '
          'char, unsigned long, CUstream_st*)'},
 {'filename': '',
  'line': 0,
  'name': 'c10::cuda::CUDACachingAllocator::Native::NativeCachingAllocator::allocate(unsigned '
          'long)'},
 {'filename': '??',
  'line': 0,
  'name': 'at::detail::empty_generic(c10::ArrayRef<long>, c10::Allocator*, c10::DispatchKeySet, '
          'c10::ScalarType, std::optional<c10::MemoryFormat>)'},
 {'filename': '??',
  'line': 0,
  'name': 'at::detail::empty_cuda(c10::ArrayRef<long>, c10::ScalarType, '
          'std::optional<c10::Device>, std::optional<c10::MemoryFormat>)'},
 {'filename': '??',
  'line': 0,
  'name': 'at::detail::empty_cuda(c10::ArrayRef<long>, std::optional<c10::ScalarType>, '
          'std::optional<c10::Layout>, std::optional<c10::Device>, std::optional<bool>, '
          'std::optional<c10::MemoryFormat>)'},
 {'filename': '??',
  'line': 0,
  'name': 'at::native::empty_cuda(c10::ArrayRef<long>, std::optional<c10::ScalarType>, '
          'std::optional<c10::Layout>, std::optional<c10::Device>, std::optional<bool>, '
          'std::optional<c10::MemoryFormat>)'},
 {'filename': 'RegisterCUDA_0.cpp',
  'line': 0,
  'name': 'at::(anonymous namespace)::(anonymous '
          'namespace)::wrapper_CUDA_memory_format_empty(c10::ArrayRef<c10::SymInt>, '
          'std::optional<c10::ScalarType>, std::optional<c10::Layout>, std::optional<c10::Device>, '
          'std::optional<bool>, std::optional<c10::MemoryFormat>)'},
 {'filename': 'RegisterCUDA_0.cpp',
  'line': 0,
  'name': 'c10::impl::wrap_kernel_functor_unboxed_<c10::impl::detail::WrapFunctionIntoFunctor_<c10::CompileTimeFunctionPointer<at::Tensor '
          '(c10::ArrayRef<c10::SymInt>, std::optional<c10::ScalarType>, '
          'std::optional<c10::Layout>, std::optional<c10::Device>, std::optional<bool>, '
          'std::optional<c10::MemoryFormat>), &at::(anonymous namespace)::(anonymous '
          'namespace)::wrapper_CUDA_memory_format_empty>, at::Tensor, '
          'c10::guts::typelist::typelist<c10::ArrayRef<c10::SymInt>, '
          'std::optional<c10::ScalarType>, std::optional<c10::Layout>, std::optional<c10::Device>, '
          'std::optional<bool>, std::optional<c10::MemoryFormat> > >, at::Tensor '
          '(c10::ArrayRef<c10::SymInt>, std::optional<c10::ScalarType>, '
          'std::optional<c10::Layout>, std::optional<c10::Device>, std::optional<bool>, '
          'std::optional<c10::MemoryFormat>)>::call(c10::OperatorKernel*, c10::DispatchKeySet, '
          'c10::ArrayRef<c10::SymInt>, std::optional<c10::ScalarType>, std::optional<c10::Layout>, '
          'std::optional<c10::Device>, std::optional<bool>, std::optional<c10::MemoryFormat>)'},
 {'filename': '??',
  'line': 0,
  'name': 'at::_ops::empty_memory_format::redispatch(c10::DispatchKeySet, '
          'c10::ArrayRef<c10::SymInt>, std::optional<c10::ScalarType>, std::optional<c10::Layout>, '
          'std::optional<c10::Device>, std::optional<bool>, std::optional<c10::MemoryFormat>)'},
 {'filename': 'RegisterBackendSelect.cpp',
  'line': 0,
  'name': 'c10::impl::wrap_kernel_functor_unboxed_<c10::impl::detail::WrapFunctionIntoFunctor_<c10::CompileTimeFunctionPointer<at::Tensor '
          '(c10::ArrayRef<c10::SymInt>, std::optional<c10::ScalarType>, '
          'std::optional<c10::Layout>, std::optional<c10::Device>, std::optional<bool>, '
          'std::optional<c10::MemoryFormat>), &at::(anonymous namespace)::empty_memory_format>, '
          'at::Tensor, c10::guts::typelist::typelist<c10::ArrayRef<c10::SymInt>, '
          'std::optional<c10::ScalarType>, std::optional<c10::Layout>, std::optional<c10::Device>, '
          'std::optional<bool>, std::optional<c10::MemoryFormat> > >, at::Tensor '
          '(c10::ArrayRef<c10::SymInt>, std::optional<c10::ScalarType>, '
          'std::optional<c10::Layout>, std::optional<c10::Device>, std::optional<bool>, '
          'std::optional<c10::MemoryFormat>)>::call(c10::OperatorKernel*, c10::DispatchKeySet, '
          'c10::ArrayRef<c10::SymInt>, std::optional<c10::ScalarType>, std::optional<c10::Layout>, '
          'std::optional<c10::Device>, std::optional<bool>, std::optional<c10::MemoryFormat>)'},
 {'filename': '??',
  'line': 0,
  'name': 'at::_ops::empty_memory_format::call(c10::ArrayRef<c10::SymInt>, '
          'std::optional<c10::ScalarType>, std::optional<c10::Layout>, std::optional<c10::Device>, '
          'std::optional<bool>, std::optional<c10::MemoryFormat>)'},
 {'filename': 'python_torch_functions_2.cpp',
  'line': 0,
  'name': 'torch::autograd::THPVariable_empty(_object*, _object*, _object*)'},
 {'filename': '', 'line': 0, 'name': 'cfunction_call.lto_priv.0'},
 {'filename': '/usr/local/src/conda/python-3.14.6/Objects/call.c',
  'line': 361,
  'name': '_PyObject_Call'},
 {'filename': '/usr/local/src/conda/python-3.14.6/Objects/call.c',
  'line': 373,
  'name': 'PyObject_Call'},
 {'filename': '/home/andy/anaconda3/envs/p14v2/lib/python3.14/site-packages/torch/nn/modules/linear.py',
  'line': 109,
  'name': '__init__'},
 {'filename': '/usr/local/src/conda/python-3.14.6/Include/internal/pycore_ceval.h',
  'line': 120,
  'name': '_PyEval_EvalFrame'},
 {'filename': '/usr/local/src/conda/python-3.14.6/Objects/call.c',
  'line': 413,
  'name': '_PyFunction_Vectorcall'},
 {'filename': '/usr/local/src/conda/python-3.14.6/Objects/typeobject.c',
  'line': 2384,
  'name': 'type_call'},
 {'filename': '/home/andy/lab/20260929/index.py', 'line': 20, 'name': '<module>'},
 {'filename': '/usr/local/src/conda/python-3.14.6/Python/generated_cases.c.h',
  'line': 2961,
  'name': '_PyEval_EvalFrameDefault'},
 {'filename': '/usr/local/src/conda/python-3.14.6/Include/internal/pycore_ceval.h',
  'line': 120,
  'name': '_PyEval_EvalFrame'},
 {'filename': '/usr/local/src/conda/python-3.14.6/Python/ceval.c',
  'line': 982,
  'name': 'PyEval_EvalCode'},
 {'filename': '/usr/local/src/conda/python-3.14.6/Python/pythonrun.c',
  'line': 1460,
  'name': 'run_mod'},
 {'filename': '/usr/local/src/conda/python-3.14.6/Python/pythonrun.c',
  'line': 1294,
  'name': 'pyrun_file'},
 {'filename': '/usr/local/src/conda/python-3.14.6/Python/pythonrun.c',
  'line': 521,
  'name': '_PyRun_SimpleFileObject'},
 {'filename': '/usr/local/src/conda/python-3.14.6/Python/pythonrun.c',
  'line': 81,
  'name': '_PyRun_AnyFileObject'},
 {'filename': '/usr/local/src/conda/python-3.14.6/Modules/main.c',
  'line': 410,
  'name': 'pymain_run_file_obj'},
 {'filename': '/usr/local/src/conda/python-3.14.6/Modules/main.c',
  'line': 830,
  'name': 'Py_BytesMain'},
 {'filename': './csu/../sysdeps/x86/libc-start.c', 'line': 58, 'name': '__libc_start_call_main'},
 {'filename': './csu/../csu/libc-start.c', 'line': 360, 'name': '__libc_start_main_impl'},
 {'filename': '??', 'line': 0, 'name': '_start'}]

ALLOCATOR_SETTINGS = {'PYTORCH_CUDA_ALLOC_CONF': '',
 'expandable_segments': False,
 'garbage_collection_threshold': 0.0,
 'graph_capture_record_stream_reuse': False,
 'max_cached_size': -1,
 'max_round_threshold': -1,
 'max_split_size': -1,
 'pinned_num_register_threads': 1,
 'pinned_use_cuda_host_register': False,
 'release_lock_on_cudamalloc': False,
 'roundup_power2_divisions': {'1': 0,
                              '1024': 0,
                              '128': 0,
                              '16': 0,
                              '16384': 0,
                              '2': 0,
                              '2048': 0,
                              '256': 0,
                              '32': 0,
                              '32768': 0,
                              '4': 0,
                              '4096': 0,
                              '512': 0,
                              '64': 0,
                              '8': 0,
                              '8192': 0}}

def ev(action, addr, size, i):
    return {"action": action, "addr": addr, "size": size, "stream": STREAM,
            "time_us": T0 + i * 1000, "compile_context": "N/A",
            "user_metadata": "", "pool_id": POOL, "frames": FRAMES}

# ---- device trace: the interior free + equal realloc phenomenon ----------
P, Q, T, U, V = BASE, BASE + 512, BASE + 1024, BASE + 1536, BASE + 2048
TAIL = BASE + 4096
steps = [
    ("alloc",          P,    100),   # bottom
    ("alloc",          Q,     40),
    ("alloc",          T,     40),   # <- the INTERIOR block (U, V sit above it)
    ("alloc",          U,     40),
    ("alloc",          V,     40),
    ("free_requested", T,     40),   # free the interior block
    ("free_completed", T,     40),
    ("alloc",          T,     40),   # IMMEDIATELY realloc equal size @ same addr
    ("alloc",          TAIL,  24),   # a trailing alloc
]
trace = [ev("segment_alloc", BASE, SEG, 0)]
for i, (a, addr, sz) in enumerate(steps):
    trace.append(ev(a, addr, sz, i + 1))

# ---- one segment whose blocks tile the 2 MiB and reflect the live set -----
def rup(n, q=512):
    return ((n + q - 1) // q) * q

live = [(P, 100), (Q, 40), (T, 40), (U, 40), (V, 40), (TAIL, 24)]  # active at snapshot
blocks, cursor = [], BASE
for addr, req in live:
    if addr > cursor:                                   # gap -> inactive filler
        blocks.append({"address": cursor, "size": addr - cursor,
                       "requested_size": 0, "state": "inactive", "frames": []})
    size = rup(req)
    blocks.append({"address": addr, "size": size, "requested_size": req,
                   "state": "active_allocated", "frames": FRAMES})
    cursor = addr + size
if cursor < BASE + SEG:                                 # remainder -> inactive
    blocks.append({"address": cursor, "size": BASE + SEG - cursor,
                   "requested_size": 0, "state": "inactive", "frames": []})

active_size = sum(b["size"] for b in blocks if b["state"] == "active_allocated")
segment = {
    "address": BASE, "total_size": SEG, "stream": STREAM, "segment_type": "small",
    "allocated_size": active_size, "active_size": active_size,
    "requested_size": sum(req for _, req in live),
    "segment_pool_id": POOL, "is_expandable": False, "device": 0,
    "frames": [], "blocks": blocks,
}

snapshot = {
    "segments": [segment],
    "device_traces": [trace],
    "allocator_settings": ALLOCATOR_SETTINGS,
    "external_annotations": [],
}

here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, "cases", "case_interior_realloc.pickle")
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "wb") as fh:
    pickle.dump(snapshot, fh)
print("wrote", out)

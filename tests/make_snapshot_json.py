"""
Pre-process the example pickle into JSON so the unit test can call
process_alloc_data() directly without needing the in-browser unpickler.

Run once:
    python make_snapshot_json.py gpu_memory_snapshot-adam.pickle snapshot.json
"""
import json
import pickle
import sys


def to_jsonable(obj):
    if isinstance(obj, (str, int, float, bool)) or obj is None:
        return obj
    if isinstance(obj, bytes):
        return obj.decode("utf-8", errors="replace")
    if isinstance(obj, dict):
        return {str(k): to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_jsonable(v) for v in obj]
    return str(obj)


def main() -> int:
    if len(sys.argv) != 3:
        print(f"usage: {sys.argv[0]} input.pickle output.json", file=sys.stderr)
        return 2
    with open(sys.argv[1], "rb") as fh:
        snap = pickle.load(fh)
    with open(sys.argv[2], "w", encoding="utf-8") as fh:
        json.dump(to_jsonable(snap), fh, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())

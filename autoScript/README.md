# autoScript

Convert a `.pickle` snapshot to JSON by automating https://a0kuma.github.io/pytorchMemoryViz/ with Puppeteer.

## Usage

```bash
node autoScript/pickle_to_json.mjs \
  --input /absolute/path/to/snapshot.pickle \
  --output /absolute/path/to/output.json
```

Optional flags:

- `--url <url>` (default: `https://a0kuma.github.io/pytorchMemoryViz/`)
- `--timeout-ms <number>` (default: `120000`)

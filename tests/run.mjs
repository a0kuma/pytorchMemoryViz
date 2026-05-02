// Puppeteer test runner for the merged peak-tracking change.
//
// Spins up a tiny static HTTP server on the parent dir, then opens two pages:
//   1. test_unit.html       → calls process_alloc_data directly on snapshot.json
//      and asserts peak_timestep / peak_alloc_events are populated.
//   2. test_integration.html → pumps the real example pickle (from the email)
//      through add_local_files and asserts the restored "Peak active memory:"
//      console log fires.
//
// Exit code 0 on pass, 1 on fail.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".mjs":  "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pickle": "application/octet-stream",
  ".css":  "text/css; charset=utf-8",
};

function startServer() {
  return new Promise((res) => {
    const srv = createServer(async (req, rsp) => {
      const url = decodeURIComponent(req.url.split("?")[0]);
      const p = join(ROOT, url === "/" ? "/index.html" : url);
      if (!p.startsWith(ROOT)) {
        rsp.writeHead(403); rsp.end(); return;
      }
      if (!existsSync(p)) {
        rsp.writeHead(404); rsp.end("not found: " + url); return;
      }
      try {
        const buf = await readFile(p);
        rsp.writeHead(200, { "Content-Type": MIME[extname(p)] || "application/octet-stream" });
        rsp.end(buf);
      } catch (e) {
        rsp.writeHead(500); rsp.end(String(e));
      }
    });
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      res({ srv, port });
    });
  });
}

async function runUnitTest(browser, baseUrl) {
  const page = await browser.newPage();
  page.on("pageerror", e => console.log("[unit:pageerror]", e.message));
  page.on("console", m => process.env.TEST_VERBOSE && console.log("[unit:console]", m.text()));
  await page.goto(baseUrl + "/tests/test_unit.html", { waitUntil: "networkidle0", timeout: 60_000 });
  await page.waitForFunction("window.__pageReady === true", { timeout: 30_000 });
  const result = await page.evaluate(() => window.__test);
  await page.close();

  const failures = [];
  if (result.error) failures.push("threw: " + result.error);
  if (!result.result) failures.push("no result captured");
  else {
    const r = result.result;
    if (!r.keys.includes("peak_timestep")) failures.push("return is missing 'peak_timestep'");
    if (!r.keys.includes("peak_alloc_events")) failures.push("return is missing 'peak_alloc_events'");
    if (!Number.isFinite(r.peak_timestep) || r.peak_timestep < 0) failures.push("peak_timestep not a non-negative number");
    if (r.peak_alloc_events_count == null) failures.push("peak_alloc_events not an array");
    if (!(r.max_size > 0)) failures.push("max_size <= 0");
    if (!(r.max_at_time_length > 0)) failures.push("max_at_time empty");
    if (!r.has_context_for_id) failures.push("context_for_id not preserved");
    if (r.peak_timestep >= r.max_at_time_length) failures.push("peak_timestep out of range");
  }
  // Confirm the restored "Peak active memory:" log fired.
  const hasPeakLog = result.console_logs.some(l => l.includes("Peak active memory:"));
  if (!hasPeakLog) failures.push("missing 'Peak active memory:' console.log");
  const hasBlocksLog = result.console_logs.some(l => l.includes("Blocks at peak memory"));
  if (!hasBlocksLog) failures.push("missing 'Blocks at peak memory' console.log");

  return { name: "unit (process_alloc_data direct)", result, failures };
}

async function runIntegrationTest(browser, baseUrl) {
  const page = await browser.newPage();
  page.on("pageerror", e => console.log("[int:pageerror]", e.message));
  page.on("console", m => process.env.TEST_VERBOSE && console.log("[int:console]", m.text()));
  await page.goto(baseUrl + "/tests/test_integration.html", { waitUntil: "networkidle0", timeout: 60_000 });
  await page.waitForFunction("window.__pageReady === true", { timeout: 30_000 });

  await page.waitForSelector("#memvizFileInput", { timeout: 30_000 });
  const fileInput = await page.$("#memvizFileInput");
  if (!fileInput) throw new Error("MemoryViz did not create the file input");
  await fileInput.uploadFile(join(__dirname, "gpu_memory_snapshot-adam.pickle"));

  // Wait for the page to reach a terminal status (the inline script flips
  // status to 'done' as soon as the restored "Peak active memory:" log fires).
  await page.waitForFunction(
    "window.__test && (window.__test.status === 'done' || (window.__test.status || '').startsWith('error'))",
    { timeout: 60_000 },
  );

  const result = await page.evaluate(() => window.__test);
  await page.close();

  const failures = [];
  if ((result.status || "").startsWith("error")) failures.push("page status: " + result.status);
  const hasPeakLog = result.console_logs.some(l => l.includes("Peak active memory:"));
  if (!hasPeakLog) failures.push("missing 'Peak active memory:' console.log");
  const hasBlocksLog = result.console_logs.some(l => l.includes("Blocks at peak memory"));
  if (!hasBlocksLog) failures.push("missing 'Blocks at peak memory' console.log");

  // PR #4 also restored two pieces of UI from main: the red dashed peak line
  // in MemoryPlot, and the "Download peak allocs JSON" button in
  // create_trace_view. Assert both DOM elements actually rendered.
  const dom = result.dom || {};
  if (!dom.peak_line_found) failures.push("missing red dashed peak line (.peak-memory-line) in MemoryPlot");
  if (dom.peak_line_found && dom.peak_line_stroke !== "red") failures.push("peak line stroke is not 'red'");
  if (dom.peak_line_found && dom.peak_line_dash !== "6,3") failures.push("peak line is not dashed (stroke-dasharray='6,3')");
  if (!dom.download_button_found) failures.push("missing 'Download peak allocs JSON' button (button.peak-alloc-download)");
  if (dom.download_button_found && !/Download peak allocs JSON/.test(dom.download_button_text || "")) {
    failures.push("download button text is wrong: " + JSON.stringify(dom.download_button_text));
  }

  return { name: "integration (add_local_files end-to-end + UI)", result, failures };
}

async function main() {
  const { srv, port } = await startServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[server] http://127.0.0.1:${port} serving ${ROOT}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const reports = [];
  try {
    reports.push(await runUnitTest(browser, baseUrl));
    reports.push(await runIntegrationTest(browser, baseUrl));
  } finally {
    await browser.close();
    srv.close();
  }

  let overallOk = true;
  console.log("\n========== Test report ==========");
  for (const r of reports) {
    const ok = r.failures.length === 0;
    overallOk = overallOk && ok;
    console.log(`\n${ok ? "✓" : "✗"} ${r.name}`);
    if (r.result?.result) {
      console.log("  result:", JSON.stringify(r.result.result));
    }
    if (r.result?.dom) {
      console.log("  dom:   ", JSON.stringify(r.result.dom));
    }
    const peakLog = (r.result?.console_logs || []).filter(l =>
      l.includes("Peak active memory:") || l.includes("Blocks at peak memory"),
    );
    if (peakLog.length) {
      console.log("  peak logs:");
      for (const l of peakLog) console.log("    " + l);
    }
    for (const f of r.failures) console.log("  ✗ " + f);
  }
  console.log(`\n========== ${overallOk ? "PASS" : "FAIL"} ==========`);
  process.exit(overallOk ? 0 : 1);
}

main().catch(err => {
  console.error("test runner crashed:", err);
  process.exit(2);
});

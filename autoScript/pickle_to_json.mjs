#!/usr/bin/env node
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const DEFAULT_TIMEOUT_MS = 120000;

function parseArgs(argv) {
  const args = {};

  const readValue = (flag, index) => {
    if (index + 1 >= argv.length || argv[index + 1].startsWith('-')) {
      throw new Error(`Missing value for ${flag}`);
    }
    return argv[index + 1];
  };

  for (let i = 0; i < argv.length; i++) {
    const currentArg = argv[i];
    if (currentArg === '--input' || currentArg === '-i') {
      args.input = readValue(currentArg, i);
      i += 1;
    } else if (currentArg === '--output' || currentArg === '-o') {
      args.output = readValue(currentArg, i);
      i += 1;
    } else if (currentArg === '--url') {
      args.url = readValue(currentArg, i);
      i += 1;
    } else if (currentArg === '--timeout-ms') {
      args.timeoutMs = Number(readValue(currentArg, i));
      i += 1;
    }
    else if (currentArg === '--help' || currentArg === '-h') args.help = true;
  }
  return args;
}

function usage() {
  return [
    'Usage:',
    '  node autoScript/pickle_to_json.mjs --input <snapshot.pickle> --output <result.json>',
    '',
    'Options:',
    '  --url <url>            Default: https://a0kuma.github.io/pytorchMemoryViz/',
    `  --timeout-ms <number>  Default: ${DEFAULT_TIMEOUT_MS}`,
  ].join('\n');
}

async function waitForDownloadedJson(dir, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const jsonFiles = [];
    for (const e of entries) {
      if (!e.isFile() || !e.name.toLowerCase().endsWith('.json')) continue;
      const filePath = path.join(dir, e.name);
      const st = await fs.stat(filePath);
      jsonFiles.push({ filePath, mtimeMs: st.mtimeMs, size: st.size });
    }

    const nonEmptyJsonFiles = jsonFiles.filter(f => f.size > 0);
    if (nonEmptyJsonFiles.length > 0) {
      nonEmptyJsonFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);
      return nonEmptyJsonFiles[0].filePath;
    }

    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for downloaded JSON in ${dir}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input || !args.output) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }

  const inputPath = path.resolve(args.input);
  const outputPath = path.resolve(args.output);
  const targetUrl = args.url || 'https://a0kuma.github.io/pytorchMemoryViz/';
  const timeoutMs = Number.isFinite(args.timeoutMs) && args.timeoutMs > 0 ? args.timeoutMs : DEFAULT_TIMEOUT_MS;

  if (!existsSync(inputPath)) {
    throw new Error(`Input file does not exist: ${inputPath}`);
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const downloadDir = path.join(scriptDir, '.downloads', `${Date.now()}-${randomSuffix}`);
  await fs.mkdir(downloadDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setDefaultTimeout(timeoutMs);
    page.on('console', (msg) => {
      const location = msg.location();
      const locationSuffix = location?.url
        ? ` (${location.url}:${location.lineNumber}:${location.columnNumber})`
        : '';
      console.log(`[browser:${msg.type()}] ${msg.text()}${locationSuffix}`);
    });

    const cdp = await page.target().createCDPSession();
    await cdp.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir,
    });

    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: timeoutMs });
    await page.waitForSelector('input[type="file"]', { timeout: timeoutMs });

    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) throw new Error('Could not find file input element.');
    await fileInput.uploadFile(inputPath);

    await page.waitForSelector('input[type="range"]', { timeout: timeoutMs });
    const sliderUpdated = await page.evaluate(() => {
      const slider = document.querySelector('input[type="range"]');
      if (!slider) return false;
      slider.value = slider.max;
      slider.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    });
    if (!sliderUpdated) throw new Error('Failed to set range slider value');

    await page.waitForSelector('button.peak-alloc-download', { timeout: timeoutMs });
    await page.click('button.peak-alloc-download');

    const downloaded = await waitForDownloadedJson(downloadDir, timeoutMs);
    await fs.copyFile(downloaded, outputPath);

    console.log(`Saved JSON: ${outputPath}`);
  } finally {
    await browser.close();
    await fs.rm(downloadDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});

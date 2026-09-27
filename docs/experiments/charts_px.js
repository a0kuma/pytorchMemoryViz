// Render each pickle, capture the REAL painted plot, and record calibration so
// Python can measure the actual top edge (not a data reconstruction).
const puppeteer = require('/home/andyxu/pspace/node_modules/puppeteer-core');
const { spawn } = require('child_process');
const fs = require('fs');
const SERVE = '/tmp/claude-1001/-home-andyxu/bd8ea168-feb7-40b7-8e48-f1b8d81f7465/scratchpad/serve_all';
const SHOTDIR = '/tmp/claude-1001/-home-andyxu/bd8ea168-feb7-40b7-8e48-f1b8d81f7465/scratchpad/px_shots';
const PORT = 48997;

const pickles = [
  ...fs.readdirSync(SERVE + '/data').filter(f => f.endsWith('.pickle')).map(f => 'data/' + f),
  ...fs.readdirSync(SERVE + '/tests').filter(f => f.endsWith('.pickle')).map(f => 'tests/' + f),
].sort();

(async () => {
  fs.rmSync(SHOTDIR, { recursive: true, force: true }); fs.mkdirSync(SHOTDIR, { recursive: true });
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: SERVE, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--no-sandbox', '--force-device-scale-factor=1'] });
  const meta = [];
  try {
    for (const rel of pickles) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle2' });
      await (await page.$('input[type=file]')).uploadFile(SERVE + '/' + rel);
      await page.waitForFunction(() => document.querySelectorAll('svg polygon').length > 5 && window.__cache && Object.keys(window.__cache).length > 0, { timeout: 60000 });
      await new Promise(r => setTimeout(r, 600));
      const cal = await page.evaluate(() => {
        const num = v => typeof v === 'bigint' ? Number(v) : v;
        const cache = window.__cache, name = Object.keys(cache).pop(), snap = cache[name];
        if (!snap.categories) snap.categories = [];
        const dt = snap.device_traces || []; let device = 0, best = -1;
        for (let i = 0; i < dt.length; i++) { const n = (dt[i] || []).length; if (n > best) { best = n; device = i; } }
        const d = window.__pad(snap, device, false, 15000, false);
        const MAX = num(d.max_size), N = d.max_at_time.length;
        const svgs = [...document.querySelectorAll('svg')];
        // main plot = tall svg; minimap = short wide svg
        svgs.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height);
        const mainSvg = svgs[0], miniSvg = svgs[svgs.length - 1];
        const pg = mainSvg.querySelector('polygon').parentNode.getBoundingClientRect();   // scrub_group (all block polygons)
        const mp = miniSvg.querySelector('polygon').getBoundingClientRect();               // minimap area polygon
        const R = r => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height });
        return { device, N, MAX, plotRect: R(pg), miniRect: R(mp) };
      });
      const shot = `${SHOTDIR}/${rel.replace(/\//g, '__').replace(/\.pickle$/, '')}.png`;
      await page.screenshot({ path: shot, fullPage: false });
      meta.push({ pickle: rel, shot, ...cal });
      console.log(`shot ${rel}  dev${cal.device} N=${cal.N} peak=${(cal.MAX / 1048576).toFixed(1)}MiB`);
      await page.close();
    }
  } finally { await browser.close(); srv.kill(); }
  fs.writeFileSync(SHOTDIR + '/meta.json', JSON.stringify(meta, null, 2));
  console.log('wrote', meta.length, 'shots + meta.json');
})().catch(e => { console.error(e); process.exit(1); });

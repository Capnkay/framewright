// Ad-hoc QA driver — uploads several real wireframes through the real Studio UI
// (localhost:5173) and captures screenshots + generated source for each, so the
// output can be judged by eye against the source wireframe rather than guessed
// at from the JSX. Lives under server/ so `puppeteer` resolves from
// server/node_modules, same convention as e2e-wireframe.mjs.
//
// Usage: node server/qa-batch.mjs
import puppeteer from 'puppeteer';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.join(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.scratch', 'qa-results');
fs.mkdirSync(OUT, { recursive: true });

const CASES = [
  { file: path.join(ROOT, '.scratch/wireframe-tests/pricing-three-tier.png'), pageName: 'QaPricing', sectionName: 'PricingTiers' },
  { file: path.join(ROOT, '.scratch/wireframe-tests/signin-panel.png'), pageName: 'QaSignin', sectionName: 'SigninPanel' },
  { file: path.join(ROOT, '.scratch/wireframe-tests/testimonials-carousel.png'), pageName: 'QaTestimonials', sectionName: 'TestimonialsCarousel' },
  { file: path.join(ROOT, '.scratch/wireframe-tests/wireframe-sketch-09.jpg'), pageName: 'QaSketch09', sectionName: 'Sketch09' },
  { file: path.join(ROOT, 'demo_wf1.png'), pageName: 'QaDemoWf1', sectionName: 'DemoWf1' },
];

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const results = [];

for (const c of CASES) {
  const label = c.sectionName;
  console.log(`\n=== ${label} (${path.basename(c.file)}) ===`);
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });

  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });

  let apiResult = null;
  page.on('response', async (res) => {
    if (res.url().includes('/api/generate') && res.request().method() === 'POST') {
      try { apiResult = { status: res.status(), body: await res.json() }; } catch { /* non-JSON */ }
    }
  });

  // Shell.jsx's BootAnimation is a full-viewport, z-index:9999 overlay for
  // ~3.5s on every fresh sessionStorage (i.e. every fresh tab). It doesn't
  // remove testids from the DOM, so page.evaluate()-based clicks and
  // ElementHandle.type() (which force-focuses first) silently "work" right
  // through it, but a real Puppeteer mouse click (click({clickCount:3})) hits
  // the overlay instead of the element underneath — pre-seed the flag so this
  // tab skips it, same as the preview tab below.
  await page.evaluateOnNewDocument(() => sessionStorage.setItem('framewright_booted', 'true'));
  await page.goto('http://localhost:5173/generate', { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 800));

  // The real mounted route is pages/Studio.jsx (routes/GeneratePage.jsx is NOT
  // wired to /generate any more — App.jsx maps /generate -> Studio). Studio's
  // mode buttons and inputs carry data-testid attributes; "Wireframe" is
  // already the default mode but click it anyway to be sure.
  await page.click('[data-testid="mode-wireframe-button"]').catch(() => {});
  await new Promise((r) => setTimeout(r, 200));

  const fileInput = await page.$('[data-testid="wireframe-file-input"]');
  if (!fileInput) {
    console.log('NO FILE INPUT FOUND.');
    results.push({ label, error: 'no file input' });
    await page.close();
    continue;
  }
  await fileInput.uploadFile(c.file);
  // The file input's onChange sets form.fileObj via React state — give it a
  // beat before reading form.file back for confirmation.
  await new Promise((r) => setTimeout(r, 400));

  // Page name / section name inputs (data-testid page-name-input / section-name-input).
  const setInput = async (testid, value) => {
    const handle = await page.$(`[data-testid="${testid}"]`);
    if (!handle) return false;
    await handle.click({ clickCount: 3 });
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await handle.type(value, { delay: 5 });
    return true;
  };
  await setInput('page-name-input', c.pageName);
  await setInput('section-name-input', c.sectionName);
  await new Promise((r) => setTimeout(r, 200));

  const clicked = await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="generate-button"]');
    if (btn && !btn.disabled) { btn.click(); return btn.textContent.trim(); }
    return btn ? `DISABLED: ${btn.textContent.trim()}` : null;
  });
  console.log('clicked:', clicked ?? '(no generate button found)');

  // Poll for the /api/generate response rather than a fixed sleep — CRITIC_LOOP=on
  // means real render+screenshot+vision-critique rounds, which can genuinely take
  // 10-60+s. Give it up to 120s.
  const deadline = Date.now() + 120000;
  while (!apiResult && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (!apiResult) {
    console.log('TIMED OUT waiting for /api/generate response.');
    results.push({ label, error: 'timeout' });
    await page.screenshot({ path: path.join(OUT, `${label}-timeout.png`) });
    await page.close();
    continue;
  }

  console.log('api status:', apiResult.status);
  const body = apiResult.body;
  console.log('ok:', body.ok, 'warnings:', JSON.stringify(body.warnings || []));
  if (body.degraded) console.log('DEGRADED:', body.degraded, body.semanticsReason || '');

  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(OUT, `${label}-studio.png`), fullPage: true });

  const job = body.job || {};
  results.push({
    label,
    wireframe: c.file,
    pageName: c.pageName,
    sectionName: c.sectionName,
    apiStatus: apiResult.status,
    ok: body.ok,
    warnings: body.warnings || [],
    degraded: body.degraded || false,
    semanticsReason: body.semanticsReason || null,
    sectionId: job.sectionId,
    componentFile: job.componentFile,
    consoleErrors: consoleErrors.slice(0, 10),
  });

  await page.close();

  // Now open the clean /preview/<pageName> route in a fresh page — no studio
  // chrome, real Tailwind classes, real DOM — and screenshot + measure it.
  const pv = await browser.newPage();
  await pv.setViewport({ width: 1440, height: 1200 });
  // Every fresh page/tab gets its own sessionStorage, so Shell.jsx's
  // BootAnimation (2800ms show + 700ms fade, z-index 9999, covers the full
  // viewport) replays on this navigation even though the studio tab already
  // passed it. Pre-set the flag it checks so a fresh tab skips straight to
  // the real content — this is a test-harness concern, not app behaviour.
  await pv.evaluateOnNewDocument(() => sessionStorage.setItem('framewright_booted', 'true'));
  await pv.goto(`http://localhost:5173/preview/${c.pageName}`, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));
  await pv.screenshot({ path: path.join(OUT, `${label}-preview.png`), fullPage: true });

  // Measure bounding boxes of every element with an id (the ids map + card
  // fieldIds) inside the custom-preview-frame, to check for overlap.
  const measurements = await pv.evaluate(() => {
    const frame = document.querySelector('[data-testid="custom-preview-frame"]');
    if (!frame) return { error: 'no preview frame found' };
    const nodes = [...frame.querySelectorAll('[id]')];
    return nodes.map((n) => {
      const r = n.getBoundingClientRect();
      const cs = getComputedStyle(n);
      return {
        id: n.id,
        tag: n.tagName.toLowerCase(),
        className: n.className,
        bbox: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        display: cs.display,
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
      };
    });
  });
  results[results.length - 1].measurements = measurements;
  await pv.close();
}

await browser.close();

fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
console.log('\n\n=== DONE. Results written to', path.join(OUT, 'results.json'), '===');

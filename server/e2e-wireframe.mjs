// Ad-hoc end-to-end driver: upload demo_wf1.png through the real UI in Chrome.
// Lives under server/ so `puppeteer` resolves from server/node_modules.
import puppeteer from 'puppeteer';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const WIREFRAME = path.join(ROOT, 'demo_wf1.png');
const OUT = process.env.TEMP || '/tmp';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });

const consoleErrors = [];
const failedRequests = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
page.on('requestfailed', (r) => failedRequests.push(`${r.method()} ${r.url()} — ${r.failure()?.errorText}`));

// Capture the generate response as the browser sees it.
let apiResult = null;
page.on('response', async (res) => {
  if (res.url().includes('/api/generate')) {
    try { apiResult = { status: res.status(), body: await res.json() }; } catch { /* non-JSON */ }
  }
});

await page.goto('http://localhost:5173/generate', { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500));

console.log('=== STUDIO PAGE ===');
console.log('url  :', page.url());
console.log('title:', await page.title());

const fileInputs = await page.$$('input[type=file]');
console.log('file inputs:', fileInputs.length);

const buttons = await page.$$eval('button', (ns) =>
  ns.map((n) => n.textContent.trim()).filter(Boolean).slice(0, 20));
console.log('buttons:', JSON.stringify(buttons));

const modeControls = await page.$$eval('input,select,textarea', (ns) =>
  ns.map((n) => `${n.tagName.toLowerCase()}[${n.type || ''}]${n.name ? ' name=' + n.name : ''}`).slice(0, 20));
console.log('controls:', JSON.stringify(modeControls));

await page.screenshot({ path: path.join(OUT, 'e2e-1-studio.png') });

if (!fileInputs.length) {
  console.log('NO FILE INPUT FOUND — cannot upload through the UI.');
  console.log('body text:', (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 600));
  await browser.close();
  process.exit(2);
}

// --- upload -----------------------------------------------------------------
await fileInputs[0].uploadFile(WIREFRAME);
console.log('\nuploaded:', path.relative(ROOT, WIREFRAME));
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: path.join(OUT, 'e2e-2-uploaded.png') });

// --- submit -----------------------------------------------------------------
const clicked = await page.evaluate(() => {
  const wanted = /generate|submit|build|create|run/i;
  const btn = [...document.querySelectorAll('button')]
    .find((b) => wanted.test(b.textContent || '') && !b.disabled);
  if (btn) { btn.click(); return btn.textContent.trim(); }
  return null;
});
console.log('clicked:', clicked ?? '(no enabled generate button found)');

// Generation runs stages 1-7 plus, with CRITIC_LOOP=on, the critic loop.
await new Promise((r) => setTimeout(r, 90000));

await page.screenshot({ path: path.join(OUT, 'e2e-3-result.png'), fullPage: true });

console.log('\n=== RESULT ===');
console.log('api status:', apiResult?.status ?? '(no /api/generate response seen)');
if (apiResult?.body) {
  const b = apiResult.body;
  console.log('ok        :', b.ok);
  if (b.error) console.log('error     :', JSON.stringify(b.error));
  const keys = Object.keys(b);
  console.log('body keys :', JSON.stringify(keys));
  if (b.sectionId) console.log('sectionId :', b.sectionId);
  if (b.jobId) console.log('jobId     :', b.jobId);
  if (b.warnings?.length) console.log('warnings  :', JSON.stringify(b.warnings.slice(0, 8), null, 1));
}

console.log('\npage text:', (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 700));
console.log('\nconsole errors:', consoleErrors.slice(0, 6));
console.log('failed requests:', failedRequests.slice(0, 6));

await browser.close();

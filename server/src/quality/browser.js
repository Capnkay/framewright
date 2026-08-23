import puppeteer from 'puppeteer';

let browserInstance = null;

export async function getBrowser() {
  if (!browserInstance) {
    browserInstance = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browserInstance;
}

export async function takeScreenshot(url, width = 1600, height = 1200) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  await page.setViewport({ width, height });
  
  try {
    // Wait until network is idle to ensure React has fully rendered and assets loaded
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 });
    
    // Wait an extra second for any animations to settle
    await new Promise(r => setTimeout(r, 1000));

    // Return the screenshot as a binary buffer
    const screenshotBuffer = await page.screenshot({ type: 'png' });
    return screenshotBuffer;
  } finally {
    await page.close();
  }
}

/**
 * Screenshot an HTML document supplied as a string.
 *
 * WHY THIS EXISTS ALONGSIDE takeScreenshot. Screenshotting the generated
 * component by URL would mean standing up the Vite dev server, writing the
 * component into the client source tree, waiting for HMR, and hoping the route
 * exists — a running second process on the critical path of every generation.
 * `setContent` needs none of that: quality/render.js server-renders the
 * component to a string, and this puts that string in front of a real engine
 * with real layout. Same pixels, no dev server.
 *
 * `networkidle0` is deliberately NOT used here. The document is self-contained
 * — inlined CSS, no script tags — so there is no network to go idle, and
 * waiting for it would spend the full timeout on every call.
 */
export async function screenshotHtml(html, { width = 1600, height = 1200, timeout = 15000 } = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  try {
    await page.setContent(String(html), { waitUntil: 'load', timeout });
    // Fonts settle after load and shift text metrics; a wireframe comparison
    // that catches the page mid-swap reports a mismatch that is not there.
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    return await page.screenshot({ type: 'png', fullPage: true });
  } finally {
    await page.close();
  }
}

export async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * measureLayout(html, ids, opts) -> [{ id, rect, ancestorIds }] | null
 *
 * Loads `html` into a page from the SAME shared browser instance every other
 * §18 render uses (`getBrowser()` above) — a fresh Chromium is launched at
 * most once per process, and every call after the first pays only for a new
 * page/tab, not a new browser. That is what keeps this cheap enough to run
 * on every generation: launching a browser is the ~500ms part; opening a
 * page against an already-running one measured at ~60-90ms locally
 * (see server/src/quality/layout.js's header for the numbers).
 *
 * `ids` are real DOM ids the caller already knows — this module invents
 * nothing. For each id found in the rendered document it returns the real
 * `getBoundingClientRect()` geometry plus `ancestorIds`: the subset of the
 * OTHER given ids whose element is an ancestor of this one in the actual DOM
 * tree. That is how server/src/quality/layout.js tells containment (a card's
 * own children sitting inside the card's box, which is by design) apart from
 * two siblings whose boxes should never intersect — containment is read off
 * the real tree, not inferred from coordinates.
 *
 * NEVER THROWS. Same posture as `screenshotHtml` above: any failure — no
 * Chromium downloaded, a bad `html` string, a closed browser — returns
 * `null`, which server/src/quality/layout.js reads as "not measured", never
 * as "measured, zero overlap".
 */
export async function measureLayout(html, ids, { width = 1600, height = 1200, timeout = 15000 } = {}) {
  if (!html || typeof html !== 'string') return null;
  if (!Array.isArray(ids) || ids.length === 0) return null;

  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width, height });
    await page.setContent(html, { waitUntil: 'load', timeout });
    await page.evaluate(() => document.fonts?.ready).catch(() => {});

    return await page.evaluate((elementIds) => {
      const idSet = new Set(elementIds);
      return elementIds.map((id) => {
        const el = document.getElementById(id);
        if (!el) return { id, rect: null, ancestorIds: [] };
        const r = el.getBoundingClientRect();
        const ancestorIds = [];
        let parent = el.parentElement;
        while (parent) {
          if (parent.id && idSet.has(parent.id)) ancestorIds.push(parent.id);
          parent = parent.parentElement;
        }
        return {
          id,
          rect: { x: r.x, y: r.y, width: r.width, height: r.height },
          ancestorIds,
        };
      });
    }, ids);
  } catch {
    return null;
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

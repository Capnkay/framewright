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

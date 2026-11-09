// The promo editor opened in Windows Chrome (H.264 needs Chrome's codecs) on an EDL, for the checks (edcheck, tlcheck,
// mobcheck): run them under tools/gpu-node.sh from WSL, with the editor's server running.
import { chromium } from 'playwright-core';
import { cliArgs } from './paths.mjs';

export const args = cliArgs();
/** { browser, page, errs }: the editor at `url` showing EDL `edl`, its page errors collected; `throttle` (Mbit/s) and
 * `latency` (ms) emulate a slow link (a laptop across the tailnet). */
export async function openEditor({ edl = args.edl || 'v12-manual', url = args.url || 'http://localhost:8642', viewport = { width: 1600, height: 1000 }, context = {}, throttle = +(args.throttle || 0), latency = +(args.latency || 30) } = {}) {
  const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport, ...context }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  if (throttle) { const cdp = await ctx.newCDPSession(page); await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency, downloadThroughput: throttle * 125000, uploadThroughput: throttle * 125000 }); }
  await page.goto(url);
  await page.waitForFunction(() => window.__ed?.S.sp?.length > 0, null, { timeout: 30000 });
  await page.evaluate((e) => localStorage.setItem('promo.edl', e), edl);
  await page.reload();
  await page.waitForFunction((e) => window.__ed?.S.sp?.length > 0 && window.__ed.S.name === e, edl, { timeout: 30000 });
  return { browser, ctx, page, errs };
}

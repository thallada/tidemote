// Temporary: load the page, fast-forward, screenshot whole and zoomed.
import { chromium } from 'playwright-core';
const [url, out, secs] = [process.argv[2], process.argv[3], +(process.argv[4] || 120)];
const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', args: ['--enable-unsafe-webgpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.addInitScript(() => { window.__MC_MAX = +(new URL(location.href).searchParams.get('max') || 262144); });
await page.goto(url);
for (let i = 0; i < 60; i++) { await page.waitForTimeout(2000); if (/Universe fixed/.test(await page.textContent('#calib'))) break; }
await page.waitForTimeout(2000);
await page.keyboard.press('>');
await page.waitForTimeout(secs * 1000);
await page.keyboard.press('/');
await page.keyboard.press('i');
await page.waitForTimeout(1500);
const epoch = await page.evaluate(() => document.getElementById('epoch').textContent);
await page.screenshot({ path: out + '-full.png' });
await page.mouse.move(640, 380);
for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(80); }
await page.waitForTimeout(2500);
await page.screenshot({ path: out + '-zoom.png' });
console.log('epoch', epoch, 'errors', JSON.stringify(errs.slice(0, 5)));
await browser.close();

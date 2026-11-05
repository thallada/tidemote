// Chrome on an Android phone, driven over adb and the DevTools protocol, for the tools that drive the page
// (tools/perf/bench.mjs --android). Connect the phone first: USB debugging and a cable (under WSL, through Windows'
// adb), or Developer options → Wireless debugging (`adb pair IP:PORT CODE`, then `adb connect IP:PORT`). androidChrome() forwards the phone's DevTools socket and
// returns a context whose pages offer the part of Playwright's Page the tools use, over a tab of their own: Playwright's
// connectOverCDP attaches to every tab, and stalls on the ones Android has frozen in the background. serve(port) lets
// the phone reach a server here as localhost (adb reverse; WebGPU needs a secure origin, which localhost is).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Under WSL a phone on USB belongs to Windows' adb: run the tool with tools/gpu-node.sh (Windows Node), which finds
// adb.exe where Android's SDK puts it (WSL's adb reaches a phone over Wi-Fi only)
const winAdb = process.platform === 'win32' && path.join(process.env.LOCALAPPDATA || '', 'Android/Sdk/platform-tools/adb.exe');
const ADB = process.env.ADB || (winAdb && fs.existsSync(winAdb) ? winAdb : 'adb');
export const adb = (...args) => execFileSync(ADB, args, { encoding: 'utf8', timeout: 60000 }).trim();

/** The phone's state worth recording beside a measure: thermal status, the SoC's temperature, battery, charging. */
export function phoneState() {
  const th = adb('shell', 'dumpsys', 'thermalservice');
  const bat = adb('shell', 'dumpsys', 'battery');
  const soc = /mValue=([\d.]+), mType=-?\d+, mName=soc_therm/.exec(th);
  return {
    thermal: +(/Thermal Status: (\d+)/.exec(th)?.[1] ?? -1),
    soc: soc ? +(+soc[1]).toFixed(1) : null,
    battery: +(/level: (\d+)/.exec(bat)?.[1] ?? -1),
    batteryC: +(/temperature: (\d+)/.exec(bat)?.[1] ?? 0) / 10,
    powered: /(AC|USB|Wireless) powered: true/.test(bat),
  };
}

const served = [];
export function serve(port) { adb('reverse', `tcp:${port}`, `tcp:${port}`); served.push(port); }

class Page {
  constructor(target, http, browser = null) {
    this.target = target; this.http = http; this.browser = browser;
    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    this.seq = 0; this.wait = new Map(); this.listeners = { console: [], pageerror: [] }; this.events = [];
    this.open = new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id) { const w = this.wait.get(msg.id); this.wait.delete(msg.id); if (msg.error) w?.rej(new Error(`${w.method}: ${msg.error.message}`)); else w?.res(msg.result); return; }
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
        const type = msg.params.type === 'warning' ? 'warn' : msg.params.type;
        for (const f of this.listeners.console) f({ type: () => type, text: () => text });
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        for (const f of this.listeners.pageerror) f(new Error(d.exception?.description || d.text));
      }
      for (const e of this.events) if (e.method === msg.method) { this.events.splice(this.events.indexOf(e), 1); e.res(msg.params); }
    };
    this.ws.onclose = () => { for (const w of this.wait.values()) w.rej(new Error('DevTools connection closed')); this.wait.clear(); };
    this.keyboard = { press: (key) => this.press(key) };
    this.mouse = { move: (x, y) => this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }) };
  }
  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((res, rej) => { this.wait.set(id, { res, rej, method }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  next(method) { return new Promise((res) => this.events.push({ method, res })); }
  async init() {
    await this.open; await this.send('Runtime.enable'); await this.send('Page.enable');
    // an automated browser, as Playwright's are (the page lets its opening menu go by itself for one)
    await this.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => true }));
    return this;
  }
  setDefaultTimeout() {}
  on(ev, f) { this.listeners[ev]?.push(f); }
  async addInitScript(fn, arg) {
    const source = typeof fn === 'function' ? `(${fn})(${JSON.stringify(arg)})` : String(fn);
    await this.send('Page.addScriptToEvaluateOnNewDocument', { source });
  }
  async evaluate(fn, arg) {
    const expression = typeof fn === 'function' ? `(${fn})(${arg === undefined ? '' : JSON.stringify(arg)})` : String(fn);
    // (userGesture: as Playwright's evaluate, a call counts as the visitor's activation)
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  async goto(url) { const loaded = this.next('Page.loadEventFired'); await this.send('Page.navigate', { url }); await loaded; }
  async reload() { const loaded = this.next('Page.loadEventFired'); await this.send('Page.reload'); await loaded; }
  async waitForFunction(fn, arg, { polling = 250, timeout = 0 } = {}) {
    const t0 = Date.now();
    for (;;) {
      if (await this.evaluate(fn, arg ?? undefined)) return;
      if (timeout && Date.now() - t0 > timeout) throw new Error('waitForFunction timed out');
      await new Promise((r) => setTimeout(r, polling));
    }
  }
  waitForTimeout(ms) { return new Promise((r) => setTimeout(r, ms)); }
  async press(key) {
    for (const type of ['keyDown', 'keyUp']) await this.send('Input.dispatchKeyEvent', { type, key, code: key === 'Shift' ? 'ShiftLeft' : key });
  }
  async tap(x, y) {
    await this.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await this.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  async screenshot({ path } = {}) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(data, 'base64');
    if (path) (await import('node:fs')).writeFileSync(path, buf);
    return buf;
  }
  async close() {
    try { this.ws.close(); } catch { /* gone */ }
    // (never held up by a phone that stopped answering)
    const send = this.browser?.send('Target.closeTarget', { targetId: this.target.id }).catch(() => {});
    await Promise.race([send, new Promise((r) => setTimeout(r, 3000))]);
  }
}

/** Chrome on the connected phone (with more than one connected, the one ANDROID_SERIAL names: from WSL through
 * gpu-node.sh, `ANDROID_SERIAL=... WSLENV=ANDROID_SERIAL tools/gpu-node.sh ...`). */
export async function androidChrome({ serial = process.env.ANDROID_SERIAL } = {}) {
  if (serial) process.env.ANDROID_SERIAL = serial;
  adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
  adb('shell', 'am', 'start', '-n', 'com.android.chrome/com.google.android.apps.chrome.Main');
  // (a port of adb's choosing: 9222 is often some other browser's)
  const port = +adb('forward', 'tcp:0', 'localabstract:chrome_devtools_remote');
  const http = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i++) {
    try { await (await fetch(`${http}/json/version`, { signal: AbortSignal.timeout(5000) })).json(); break; } catch (e) { if (i > 10) throw e; await new Promise((r) => setTimeout(r, 1000)); }
  }
  // tabs are opened through the browser's own target (Android refuses /json/new)
  const { webSocketDebuggerUrl } = await (await fetch(`${http}/json/version`)).json();
  const browser = new Page({ webSocketDebuggerUrl }, http);
  await browser.open;
  const mine = [];
  return {
    async newPage() {
      const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
      const page = await new Page({ id: targetId, webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/${targetId}` }, http, browser).init();
      // in front (a tab behind the tab switcher or another tab is hidden, and a hidden page never draws; after a restart
      // Chrome opens its own new tab over it, which activateTarget alone does not undo)
      await browser.send('Target.activateTarget', { targetId }).catch(() => {});
      await page.send('Page.bringToFront').catch(() => {});
      mine.push(page);
      return page;
    },
    pages: () => mine.filter((p) => p.ws.readyState === 1),
    // the browser's own DevTools target (Tracing, Target)
    browser,
    async close() {
      for (const p of mine) await p.close();
      mine.length = 0; try { browser.ws.close(); } catch { /* gone */ }
      // the phone's ports given back (each run takes new ones)
      try { adb('forward', '--remove', `tcp:${port}`); } catch { /* gone */ }
      for (const q of served.splice(0)) try { adb('reverse', '--remove', `tcp:${q}`); } catch { /* gone */ }
    },
  };
}

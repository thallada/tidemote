// The browser a tool drives the page in, launched the same way by every tool (docs/headless-gpu.md): installed Chrome on
// the GPU (Windows Chrome from WSL under tools/gpu-node.sh, or macOS's), Playwright's Chromium headless on the GPU through
// Vulkan on Linux without a display (TIDEMOTE_VK=1, tools/vk.mjs), or Playwright's Chromium on SwiftShader.
import { vkOn, vkLaunch } from '../vk.mjs';

/** Google Chrome as installed: macOS's, else Windows' (reached from WSL through tools/gpu-node.sh). */
export const CHROME = process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

/** The flags that keep a page in the background from being throttled. */
export const UNTHROTTLED = ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];

/** A shown window of w × h at the screen's corner, never throttled. */
export const windowFlags = (w, h) => [`--window-size=${w},${h}`, '--window-position=0,0', '--no-first-run', ...UNTHROTTLED];

const UNSAFE = '--enable-unsafe-webgpu';

/**
 * Launch options for chromium.launch (or launchPersistentContext, beside the context's own), with the tool's flags `args`:
 * - vk (TIDEMOTE_VK by default): Playwright's Chromium (PLAYWRIGHT_CHROMIUM, or executablePath), headless, on the GPU
 *   through Vulkan, WebGPU unlocked;
 * - else browser 'chrome': installed Chrome (CHROME, or executablePath), shown unless `headless`;
 * - else browser 'chromium': Playwright's Chromium (PLAYWRIGHT_CHROMIUM, or executablePath), headless unless `headless`
 *   says otherwise (SwiftShader without a GPU).
 */
export function launchOptions({ args = [], browser = 'chrome', vk = vkOn, executablePath = null, headless } = {}) {
  const chromium = executablePath || process.env.PLAYWRIGHT_CHROMIUM || undefined;
  if (vk) return { ...vkLaunch(args.includes(UNSAFE) ? args : [...args, UNSAFE]), executablePath: chromium };
  if (browser === 'chromium') return { headless: headless ?? true, executablePath: chromium, args };
  return { executablePath: executablePath || CHROME, headless: headless ?? false, args };
}

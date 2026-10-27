// Playwright Chromium on the real GPU through Vulkan, on Linux without a display (docs/headless-gpu.md):
// TIDEMOTE_VK=1 turns it on. Headless Chrome needs the driver's VK_EXT_headless_surface (NVIDIA 595 and later).
export const vkOn = !!process.env.TIDEMOTE_VK;

/** Launch options for headless Chromium on the GPU (args: the tool's own, before the Vulkan ones). */
export const vkLaunch = (args = []) => ({
  headless: true,
  ignoreDefaultArgs: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'],
  args: [...args, '--enable-features=Vulkan', '--use-angle=vulkan', '--ignore-gpu-blocklist', '--disable-vulkan-surface'],
});

/** An init script: the first adapter asked for in a headless page can come back null, so ask once more. */
export const retryAdapter = () => { const req = navigator.gpu.requestAdapter.bind(navigator.gpu); navigator.gpu.requestAdapter = async (o) => (await req(o)) || req(o); };

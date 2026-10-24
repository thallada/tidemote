// Playwright Chromium on the real GPU through Vulkan, on Linux without a display: TIDEMOTE_VK_LAYER names
// the pass-through layer tools/perf/vklayer/build.sh builds (docs/headless-gpu.md).
export const vkLayer = process.env.TIDEMOTE_VK_LAYER;

/** Launch options for headless Chromium on the GPU (args: the tool's own, before the Vulkan ones). */
export const vkLaunch = (args = []) => ({
  headless: true,
  ignoreDefaultArgs: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'],
  env: { ...process.env, VK_ADD_LAYER_PATH: vkLayer, VK_INSTANCE_LAYERS: 'VK_LAYER_TIDEMOTE_headless' },
  args: [...args, '--enable-features=Vulkan', '--use-angle=vulkan', '--ignore-gpu-blocklist', '--disable-vulkan-surface'],
});

/** An init script: the first adapter asked for in a headless page can come back null, so ask once more. */
export const retryAdapter = () => { const req = navigator.gpu.requestAdapter.bind(navigator.gpu); navigator.gpu.requestAdapter = async (o) => (await req(o)) || req(o); };

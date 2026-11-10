// The Dawn adapter (the webgpu npm package) for headless tools, refusing a software one (Mesa's llvmpipe, all plain
// node finds under WSL) unless cpu is asked for: there a run crawls, and Dawn on lavapipe aborts after a few thousand
// frames whenever async readbacks are used (CLAUDE.md, Headless caveats). Under WSL run tools through tools/gpu-node.sh.

/** The adapter's name ("vendor / architecture / device / description"); exits if it is software and cpu is not set. */
export function refuseSoftware(adapter, cpu) {
  const info = adapter.info;
  const name = [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(' / ');
  if (cpu || info.architecture !== 'software') return name;
  console.error(`Dawn found only a software adapter (${name}). Pass --cpu to use it anyway;` +
    ' under WSL run through tools/gpu-node.sh to reach the GPU via Windows D3D12 (see docs/headless-gpu.md).');
  process.exit(2);
}

/** WebGPU's globals installed and a high-performance adapter: { gpu, adapter, name }. Keep gpu (the instance) for as
 * long as the device lives: collected, it takes the device with it. cpu selects Mesa lavapipe. */
export async function dawnAdapter({ cpu = false } = {}) {
  if (cpu) process.env.VK_ICD_FILENAMES = '/usr/share/vulkan/icd.d/lvp_icd.json';
  const { create, globals } = await import('webgpu');
  Object.assign(globalThis, globals);
  const gpu = create([]);
  const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) { console.error('No WebGPU adapter available'); process.exit(2); }
  return { gpu, adapter, name: refuseSoftware(adapter, cpu) };
}

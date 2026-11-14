# What a shader holds on an Adreno (tools/adreno)

`tools/adreno/regs.sh sim senseMain lifeMain senseMain:COARSE=1 lifeMain:COARSE=1 contactMain` compiles those compute
kernels with Mesa's open compiler for Adreno GPUs (turnip's ir3) on a pretended Adreno 630 and prints what each holds
at its widest moment, in seconds, with no phone: docs/performance.md, "The step in two kernels" says why that number
is what a Pixel 3's speed follows. It is another compiler than the phone's own (Qualcomm's), so trust which side of a
line a kernel is on and roughly how far, not small differences; confirm on the phone (`bench.mjs --android`).

It runs under plain Linux `node` (WSL too: not `tools/gpu-node.sh`), through the `webgpu` package's Dawn on Vulkan.

## Building Mesa once (no root; about ten minutes)

    mkdir -p ~/tools/mesa-dev/debs ~/tools/mesa-dev/root && cd ~/tools/mesa-dev
    pip3 install --user --break-system-packages meson ninja
    (cd debs && apt-get download bison flex libfl-dev libfl2 m4 libdrm-dev libdrm2 libdrm-freedreno1 libdrm-amdgpu1 \
       libdrm-intel1 libdrm-nouveau2 libdrm-radeon1 libpciaccess-dev glslang-tools libelf-dev libsigsegv2 \
       && for d in *.deb; do dpkg -x $d ../root; done)
    R=$PWD/root; sed -i "s#^prefix=/usr#prefix=$R/usr#" $R/usr/lib/x86_64-linux-gnu/pkgconfig/*.pc
    export PATH=$HOME/.local/bin:$R/usr/bin:$PATH PKG_CONFIG_PATH=$R/usr/lib/x86_64-linux-gnu/pkgconfig \
      BISON_PKGDATADIR=$R/usr/share/bison M4=$R/usr/bin/m4 LIBRARY_PATH=$R/usr/lib/x86_64-linux-gnu \
      C_INCLUDE_PATH=$R/usr/include CPLUS_INCLUDE_PATH=$R/usr/include
    git clone --depth 1 --branch mesa-26.2.3 https://gitlab.freedesktop.org/mesa/mesa.git && cd mesa
    # the allocator's widest moment, printed always (it is a debug message otherwise): in src/freedreno/ir3/ir3_ra.c
    # replace the four d(...) lines after ir3_calc_pressure(v, live, &max_pressure) with
    #   mesa_logi("RA: max pressure (half-register units): full %u half %u shared %u", max_pressure.full, max_pressure.half, max_pressure.shared);
    meson setup build -Dbuildtype=debugoptimized -Dgallium-drivers= -Dvulkan-drivers=freedreno \
      -Dtools=drm-shim,freedreno -Dplatforms= -Dglx=disabled -Degl=disabled -Dgbm=disabled -Dopengl=false \
      -Dgles1=disabled -Dgles2=disabled -Dllvm=disabled -Dfreedreno-kmds=msm,kgsl
    ninja -C build

(With root, `apt install meson ninja-build bison flex libdrm-dev glslang-tools libelf-dev` in place of the unpacked
packages.) `MESA_BUILD` names a build elsewhere.

## Reading it

    sim senseMain                  widest  29.2  used 32  waves  6  instr   5424  spills 0  const  52

- widest: the vec4 registers the kernel wants at once. Past 48 values spill to memory (the cliff: the single
  `lifeMain` of before wanted 61.5 and spilled 366 times).
- waves: how many groups of threads an a630 keeps resident with that many registers (floor(96 / used) × 2): the
  slope before the cliff. Lines to get under: 32 (6 waves), 24 (8), 19 (10), 16 (12), 12 (16).
- `RAW=1` prints the disassembly; `PATCH`, `SHADERS` and `SIMOPTS` are in regs.mjs's head.

A fragment shader is named with its vertex stage, `ENTRY@VERTEX[/TARGETS]` (TARGETS rgba16float color targets, 1 if
left out; the overrides go to both stages), and its line is the fragment shader's alone:

    tools/adreno/regs.sh POST_WGSL fsComposite@vsComp fsComposite@vsComp:LEAN=1
    tools/adreno/regs.sh DRAW_WGSL fsPointLive@vsPoint/2 fsPointLive@vsPoint/2:INTERIOR=0:NECKS=0

- const: the shader's constants (uniforms, and the immediates its instructions cannot encode), in vec4. A fragment
  shader past 100 is compiled twice by turnip (`tu_shader.cc`, `ir3_trim_constlen`): as it is, which the pipeline draws
  with while its stages' constants together fit 512 (a vertex stage of the page's holds 8-84), and a "safe" variant
  held to 100, whose other immediates become `mov`s into registers held from first use to last, which it keeps only for
  a pipeline past 512. The line is the first; `safe W/S` at its end is the other's widest and spills, not what draws.
  (Before 2026-11-13 the line was the safe variant's: `fsComposite` "59.2, 25 spills" draws at 31.8 with none.)
  Compute kernels are compiled once (their own const file).

## Where a shader holds it (optional)

`ir3-peak.patch` (here) adds a debug print to Mesa's pressure pass: `git apply` it in the Mesa tree, `ninja -C build`.
`IR3_PEAK=240 RAW=1 tools/adreno/regs.sh sim lifeMain` then prints `BLK n max m` for each block whose pressure reaches
240 half-registers (30 vec4), and at each new record of the widest moment `PEAK`, every value live there (`LIVE`, its
size in half-registers and the instruction that made it): loop phis, loads held, addresses (an a630 load takes no
immediate offset, so each field read is a register while it waits), constants. Cutting code with `PATCH` and
watching which blocks fall tells which source they are.

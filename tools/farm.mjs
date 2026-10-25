// Farm one ensemble's seeds out to several machines (this one and others over ssh), then analyze and gate
// them with ensemble.mjs --from. Every host runs the same commit from its own worktree
// (~/.cache/tidemote-farm/worktrees/SHA), never the checkout that is there, so branches can differ between
// machines and editing src/ never changes a running farm. Hosts live outside the repo, in
// ~/.config/tidemote/farm.json (or --hosts / $TIDEMOTE_FARM); see docs/headless-gpu.md for the format:
//   { "hosts": { "LABEL": { "hostname": "...", "ssh": "user@host", "repo": "~/path/to/tidemote", "slots": 4,
//                           "node": "node", "args": [], "env": {}, "path": [] }, ... } }
// The host whose hostname is this machine's runs without ssh; labels are what runs record as their host.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const { values: v } = parseArgs({ options: {
  runs: { type: 'string', default: '24' }, 'first-seed': { type: 'string', default: '1' },
  minutes: { type: 'string', default: '30' }, n: { type: 'string', default: '32768' },
  k: { type: 'string', default: '{}' }, 'no-eras': { type: 'boolean' }, step: { type: 'string', default: '1' },
  temp: { type: 'string' }, sample: { type: 'string', default: '5' },
  out: { type: 'string' }, commit: { type: 'string' }, dirty: { type: 'boolean' },
  hosts: { type: 'string', default: process.env.TIDEMOTE_FARM ?? path.join(os.homedir(), '.config/tidemote/farm.json') },
  only: { type: 'string' }, attempts: { type: 'string', default: '3' }, clean: { type: 'boolean' },
  name: { type: 'string' }, baseline: { type: 'string' }, targets: { type: 'string' }, 'save-baseline': { type: 'string' },
  alpha: { type: 'string' }, wait: { type: 'string', default: '3' }, restore: { type: 'string', default: '10' },
  cooldown: { type: 'string', default: '10' }, help: { type: 'boolean' },
} });
if (v.help || (!v.out && !v.clean)) {
  console.log(`Usage: node tools/farm.mjs --out runs/NAME [options]
  --runs 24 --first-seed 1 --minutes 30 --n 32768 --k '{}' --no-eras --step 1 --temp T --sample 5
                          As ensemble.mjs; each seed is one sim.mjs run on whichever host has a free slot
  --commit REF            Commit to run (default HEAD; a resumed --out keeps the commit it started with)
  --dirty                 Run HEAD plus the uncommitted changes to tracked files (git stash create)
  --hosts FILE            Host list (default ~/.config/tidemote/farm.json or $TIDEMOTE_FARM)
  --only a,b              Use only these hosts
  --attempts 3            Tries per seed before giving up on it (any host)
  --wait 3                Seconds before trying a host again whose slots another farm holds (so farms run at once
                          fill each other's tails)
  --restore 10            A host that failed runs with one slot fewer; after this many minutes without a failure it
                          gets one back (up to its slots), so it recovers once whatever starved it is gone
  --cooldown 10           A host that keeps failing at one slot rests this many minutes, then tries one again
  --name --baseline --targets --save-baseline --alpha
                          Passed to ensemble.mjs --from, which writes report.json and sets the exit code
  --clean                 Remove the farm's worktrees, refs and node_modules on every host (none running)
Seeds already in --out are kept, so rerunning the same command resumes. Each host holds its slots with
flock in ~/.cache/tidemote-farm/slots, so farms started from several places share a GPU.`);
  process.exit(0);
}

const all = JSON.parse(fs.readFileSync(v.hosts, 'utf8')).hosts;
const only = v.only?.split(',');
for (const name of only ?? []) if (!all[name]) throw new Error(`no host ${name} in ${v.hosts}`);
const hosts = Object.entries(all).filter(([name]) => !only || only.includes(name))
  .map(([name, h]) => ({ name, slots: 1, node: 'node', ...h, local: h.hostname === os.hostname(), down: null, fails: 0 }));
for (const h of hosts) if (!h.local && !h.ssh) throw new Error(`host ${h.name} is not this machine and has no ssh`);

// Shell quoting for the host's bash; a leading ~/ expands to the host's $HOME
const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const hq = (s) => String(s).startsWith('~/') ? `"$HOME"/${q(String(s).slice(2))}` : q(s);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const children = new Set();
// Run a bash script on a host (stdin, so the remote login shell never parses it)
function sh(h, script) {
  return new Promise((resolve) => {
    const c = h.local ? spawn('bash', ['-s'])
      : spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ControlMaster=auto', '-o', `ControlPath=${path.join(os.tmpdir(), 'tidemote-farm-%C')}`, '-o', 'ControlPersist=120', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=4', h.ssh, 'bash -s']);
    children.add(c);
    const out = [];
    let err = '';
    c.stdout.on('data', (b) => out.push(b));
    c.stderr.on('data', (b) => { err = (err + b).slice(-3000); });
    c.on('error', (e) => { err += String(e); });
    c.on('close', (code) => { children.delete(c); resolve({ code: code ?? 1, stdout: Buffer.concat(out).toString(), stderr: err }); });
    c.stdin.on('error', () => {});
    c.stdin.end(script);
  });
}
const FARM = 'FARM="$HOME/.cache/tidemote-farm"';
const prelude = (h) => `set -euo pipefail
${FARM}; REPO=${hq(h.repo)}; SHA=${sha}; WT="$FARM/worktrees/$SHA"
${h.path?.length ? `export PATH="$PATH"${h.path.map((p) => ':' + hq(p)).join('')}` : ''}
`;

if (v.clean) {
  for (const ref of git(['for-each-ref', '--format=%(refname)', 'refs/farm/']).split('\n').filter(Boolean)) git(['update-ref', '-d', ref]);
  await Promise.all(hosts.map(async (h) => {
    const r = await sh(h, `set -u; ${FARM}; REPO=${hq(h.repo)}
for d in "$FARM"/worktrees/*/; do [ -d "$d" ] || continue; git -C "$REPO" worktree remove --force "$d" 2>/dev/null || rm -rf "$d"; done
git -C "$REPO" worktree prune
git -C "$REPO" for-each-ref --format='%(refname)' refs/farm/ | while read -r ref; do git -C "$REPO" update-ref -d "$ref"; done
rm -rf "$FARM/node_modules" "$FARM/pids"`);
    console.log(`${h.name}: ${r.code ? `failed (${r.stderr.trim()})` : 'cleaned'}`);
  }));
  process.exit(0);
}

const out = path.resolve(v.out);
fs.mkdirSync(out, { recursive: true });
const config = { n: +v.n, minutes: +v.minutes, k: JSON.parse(v.k), eras: !v['no-eras'], step: +v.step, temp: v.temp != null ? +v.temp : undefined };
const runs = +v.runs, first = +v['first-seed'], attempts = +v.attempts;
if (![runs, first, attempts, config.n].every(Number.isInteger) || runs < 1 || attempts < 1) throw new Error('--runs, --first-seed, --attempts and --n must be integers');

// The commit: a resumed --out keeps its own; otherwise HEAD, refusing uncommitted changes unless --dirty
const record = path.join(out, 'farm.json');
const prior = fs.existsSync(record) ? JSON.parse(fs.readFileSync(record, 'utf8')) : null;
let sha;
if (v.commit) sha = git(['rev-parse', '--verify', `${v.commit}^{commit}`]);
else if (prior) sha = prior.commit;
else {
  const changed = git(['status', '--porcelain', '--untracked-files=no']);
  if (changed && !v.dirty) throw new Error(`uncommitted changes:\n${changed}\ncommit them, or pass --dirty to run them as they are`);
  sha = (changed && git(['stash', 'create'])) || git(['rev-parse', 'HEAD']);
}
if (prior && prior.commit !== sha) throw new Error(`${v.out} holds seeds from ${prior.commit}; use another --out or --commit ${prior.commit}`);
if (prior && JSON.stringify(prior.config) !== JSON.stringify(config)) throw new Error(`${v.out} holds seeds run with ${JSON.stringify(prior.config)}`);
fs.writeFileSync(record, JSON.stringify({ commit: sha, config, hosts: hosts.map((h) => h.name), created: prior?.created ?? new Date().toISOString() }, null, 2) + '\n');

const seedFile = (seed) => path.join(out, `seed${seed}.json`);
const queue = Array.from({ length: runs }, (_, i) => first + i).filter((seed) => !fs.existsSync(seedFile(seed))).map((seed) => ({ seed, tries: 0 }));
const total = queue.length, failed = [];
const run = `${path.basename(out).replace(/[^\w.-]/g, '_')}-${Date.now().toString(36)}`;
console.log(`farm ${run}: ${total} of ${runs} seeds at ${sha.slice(0, 10)} on ${hosts.map((h) => `${h.name}${h.local ? ' (here)' : ''} ×${h.slots}`).join(', ')}`);

let stopping = false;
async function stop(signal) {
  if (stopping) process.exit(130);
  stopping = true;
  console.error(`\n${signal}: stopping this farm's runs`);
  for (const c of children) c.kill();
  await Promise.all(hosts.map((h) => sh(h, `${FARM}
for f in "$FARM/pids/${run}".*; do [ -e "$f" ] || continue; kill -TERM -- -"$(cat "$f")" 2>/dev/null || true; rm -f "$f"; done`)));
  process.exit(130);
}
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

if (total) {
  // Ship the commit to every host as refs/farm/SHA, then give each a worktree with node_modules installed
  // once per package-lock.json and hard-linked in (Windows node under WSL cannot follow symlinks there)
  git(['update-ref', `refs/farm/${sha}`, sha]);
  await Promise.all(hosts.map(async (h) => {
    const target = h.local ? h.repo.replace(/^~\//, os.homedir() + '/') : `${h.ssh}:${h.repo.replace(/^~\//, '')}`;
    try {
      execFileSync('git', ['push', '--quiet', target, `${sha}:refs/farm/${sha}`], { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, GIT_SSH_COMMAND: 'ssh -o BatchMode=yes -o ConnectTimeout=10' } });
    } catch (e) { h.down = `push failed: ${String(e.stderr ?? e).trim()}`; return; }
    const r = await sh(h, `${prelude(h)}
mkdir -p "$FARM/worktrees" "$FARM/node_modules" "$FARM/slots" "$FARM/pids"
exec 8>"$FARM/prepare.lock"; flock 8
if [ ! -e "$WT/.farm-ready" ]; then
  rm -rf "$WT"; git -C "$REPO" worktree prune
  git -C "$REPO" worktree add --detach --quiet "$WT" "$SHA"
  NM="$FARM/node_modules/$(sha256sum "$WT/package-lock.json" | cut -c1-16)"
  if [ ! -d "$NM/node_modules" ]; then
    rm -rf "$NM.tmp"; mkdir -p "$NM.tmp"; cp "$WT/package.json" "$WT/package-lock.json" "$NM.tmp/"
    (cd "$NM.tmp" && npm ci --no-audit --no-fund --loglevel=error) >&2
    mv "$NM.tmp" "$NM"
  fi
  cp -al "$NM/node_modules" "$WT/node_modules"
  touch "$WT/.farm-ready"
fi
${Object.keys(h.env ?? {}).filter((key) => key.startsWith('TIDEMOTE_')).map((key) =>
  `grep -q ${key} "$WT/tools/sim.mjs" || { echo "sim.mjs at $SHA does not read ${key}" >&2; exit 3; }`).join('\n')}`);
    if (r.code) h.down = `setup failed: ${r.stderr.trim()}`;
  }));
  for (const h of hosts) if (h.down) console.log(`${h.name}: ${h.down}`);
  if (hosts.every((h) => h.down)) throw new Error('no host is ready');

  const t0 = Date.now();
  let done = 0, inflight = 0;
  const simArgs = (seed) => ['tools/sim.mjs', '--n', config.n, '--minutes', config.minutes, '--seed', seed, '--k', JSON.stringify(config.k),
    '--print', '1e9', '--sample', v.sample, ...(config.eras ? [] : ['--no-eras']), ...(config.step !== 1 ? ['--step', config.step] : []),
    ...(config.temp != null ? ['--temp', config.temp] : [])];
  // One job: take a free slot on the host (exit 75 if none: another farm has them), run sim.mjs in its own
  // session (so a stop can kill it), print the run JSON. Paths stay relative: Windows node reads them too.
  const job = (h, seed) => `${prelude(h)}
cd "$WT"
# the host's current slot limit, shared by every farm using it (written when a farm sheds or restores a slot)
L=$(cat "$FARM/limit" 2>/dev/null || true); case "$L" in ""|*[!0-9]*) L=${h.slots};; esac; [ "$L" -ge 1 ] && [ "$L" -le ${h.slots} ] || L=${h.slots}
got=; for i in $(seq 0 $((L - 1))); do exec 9>"$FARM/slots/$i"; if flock -n 9; then got=1; break; fi; done
[ -n "$got" ] || exit 75
F="farm-out/${run}/seed${seed}"; P="$FARM/pids/${run}.${seed}"; mkdir -p "farm-out/${run}"
setsid env ${Object.entries(h.env ?? {}).map(([key, x]) => `${key}=${hq(x)}`).join(' ')} ${hq(h.node)} ${[...simArgs(seed), ...(h.args ?? [])].map(q).join(' ')} --out "$F.json" </dev/null >"$F.log" 2>&1 &
echo $! >"$P"
set +e; wait $!; code=$?; set -e
rm -f "$P"
if [ $code -ne 0 ]; then tail -c 2500 "$F.log" >&2; exit $(( code == 75 ? 1 : code )); fi
cat "$F.json"; rm -f "$F.json"`;

  // Each host runs at most h.limit seeds at once: a failed run takes a slot away (the host is short of
  // memory or GPU), a stretch without failures gives one back, and a host failing even with one slot
  // rests a while before trying again. Only failures with a single slot count against the seed itself.
  const restoreMs = +v.restore * 60000, coolMs = +v.cooldown * 60000;
  for (const h of hosts) Object.assign(h, { limit: h.slots, active: 0, lastFail: 0, lastChange: Date.now(), rest: 0 });
  // the host keeps its limit for every farm sharing it: start from what it holds (the restore brings a
  // stale one back up), and tell it whenever this farm sheds or restores a slot
  const setLimit = (h) => sh(h, `${FARM}; mkdir -p "$FARM"; echo ${h.limit} >"$FARM/limit"`);
  await Promise.all(hosts.filter((h) => !h.down).map(async (h) => {
    const held = parseInt((await sh(h, `${FARM}; cat "$FARM/limit" 2>/dev/null || true`)).stdout, 10);
    if (held >= 1 && held < h.slots) { h.limit = held; console.log(`${h.name}: holding ${held} of ${h.slots} slots (another farm shed the rest)`); }
  }));
  const worker = async (h) => {
    while (!h.down && !stopping) {
      const now = Date.now();
      if (h.rest > now) { if (!queue.length && !inflight) return; await sleep(5000); continue; }
      if (h.rest) { h.rest = 0; h.lastChange = now; console.log(`${h.name}: rested; trying again with one slot`); }
      if (h.limit < h.slots && now - h.lastFail > restoreMs && now - h.lastChange > restoreMs) {
        h.limit++; h.lastChange = now; setLimit(h);
        console.log(`${h.name}: no failures for ${v.restore} min; back up to ${h.limit} of ${h.slots} slots`);
      }
      if (h.active >= h.limit) { if (!queue.length && !inflight) return; await sleep(1000); continue; }
      const item = queue.shift();
      if (!item) { if (!inflight) return; await sleep(1000); continue; }
      inflight++; h.active++;
      const r = await sh(h, job(h, item.seed));
      inflight--; h.active--;
      if (stopping) return;
      if (r.code === 75) {
        if (!h.waiting) console.log(`${h.name}: every slot is taken by another farm; waiting`);
        h.waiting = true; queue.unshift(item); await sleep(+v.wait * 1000); continue;
      }
      h.waiting = false;
      let result;
      try { if (!r.code) result = JSON.parse(r.stdout); } catch (e) { r.stderr += `\nunreadable run JSON: ${e.message}`; }
      if (!result) {
        const atOne = h.limit <= 1;
        if (atOne) item.tries++;
        console.error(`seed ${item.seed} failed on ${h.name} (${atOne ? `try ${item.tries}/${attempts}` : 'not counted'}, exit ${r.code}):\n${r.stderr.trim().split('\n').slice(-12).join('\n')}`);
        if (item.tries < attempts) queue.unshift(item); else failed.push(item.seed);
        h.lastFail = Date.now();
        if (!atOne) {
          h.limit--; h.lastChange = h.lastFail; setLimit(h);
          console.error(`${h.name}: down to ${h.limit} of ${h.slots} slots`);
        } else if (++h.fails >= 3) {
          h.fails = 0; h.rest = h.lastFail + coolMs;
          console.error(`${h.name}: three failures in a row with one slot; resting ${v.cooldown} min (its seeds go to the other hosts meanwhile)`);
        }
        continue;
      }
      h.fails = 0;
      Object.assign(result.config, { host: h.name, commit: sha });
      fs.writeFileSync(seedFile(item.seed) + '.tmp', JSON.stringify(result, null, 2) + '\n');
      fs.renameSync(seedFile(item.seed) + '.tmp', seedFile(item.seed));
      done++;
      const o = result.outcome, eta = (Date.now() - t0) / done * (total - done - failed.length) / 1000;
      console.log(`[${done}/${total}] seed ${item.seed} on ${h.name}: ${o?.outcome ?? 'too short'}` +
        (o ? ` eff=${o.lateEffSpecies.toFixed(1)} guilds=${o.lateGuilds} max=${o.lateMaxShare.toFixed(2)}` : '') + ` · eta ${Math.round(eta)}s`);
    }
  };
  await Promise.all(hosts.flatMap((h) => Array.from({ length: h.slots }, () => worker(h))));
  if (stopping) await new Promise(() => {}); // stop() exits once the hosts are cleaned up
  failed.push(...queue.map((item) => item.seed));
}

// Analyze (and gate) everything in --out exactly as ensemble.mjs does
const ensemble = fileURLToPath(new URL('./ensemble.mjs', import.meta.url));
const pass = ['name', 'baseline', 'targets', 'save-baseline', 'alpha'].flatMap((key) => v[key] != null ? [`--${key}`, v[key]] : []);
const code = await new Promise((resolve) => spawn(process.execPath, [ensemble, '--from', out, ...pass], { stdio: 'inherit' }).on('close', resolve));
if (failed.length) console.error(`\nmissing seeds (failed ${attempts} times or no host left): ${failed.sort((a, b) => a - b).join(', ')}`);
process.exit(code || (failed.length ? 2 : 0));

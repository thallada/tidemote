"""Build a SuperCollider NRT render script from an events.json list.
usage: python3 make_scd.py events.json out.wav [--nonoise] [--dry]
--nonoise replaces every noise UGen with DC(0) (the JS engine's noiseOff mode)
--dry renders voices straight to the output (no delay, reverb or master)"""
import json, re, sys, os
ev_path, out_wav = sys.argv[1], sys.argv[2]
nonoise, dry = '--nonoise' in sys.argv, '--dry' in sys.argv
here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, 'voices.scd')).read()
if nonoise:
    pat = re.compile(r'(LFNoise2|WhiteNoise|PinkNoise|BrownNoise|Dust2|Dust)\.(ar|kr)\(')
    out, i = [], 0
    while True:
        m = pat.search(src, i)
        if not m: out.append(src[i:]); break
        out.append(src[i:m.start()]); j = m.end(); depth = 1
        while depth: depth += {'(': 1, ')': -1}.get(src[j], 0); j += 1
        out.append(f'DC.{m.group(2)}(0)'); i = j
    src = ''.join(out)
    src = re.sub(r'(LFNoise2|WhiteNoise|PinkNoise|BrownNoise|Dust2|Dust)\.(ar|kr)(?!\()', r'DC.\2(0)', src)  # bare WhiteNoise.ar
events = json.load(open(ev_path))
def lit(v):
    if isinstance(v, str): return '\\' + v
    return repr(float(v))
lines = []
ids = {}
for e in events:
    t = e['t']
    if 'set' in e:
        nid = ids.get(e['set'], 904 if e['set'] == 'master' else None)
        args = ', '.join(f'\\{k}, {lit(v)}' for k, v in e['params'].items())
        lines.append(f'  [{t!r}, [\\n_set, {nid}, {args}]],')
    else:
        nid = -1
        if e.get('id') is not None:
            nid = 2000 + len(ids); ids[e['id']] = nid
        params = dict(e.get('params', {}))
        params.update({'out': 0 if dry else 64, 'revBus': 66, 'dlyBus': 68})
        args = ', '.join(f'\\{k}, {lit(v)}' for k, v in params.items())
        lines.append(f'  [{t!r}, [\\s_new, \\{e["def"]}, {nid}, 0, 900, {args}]],')
dur = max(e['t'] for e in events) + json.load(open(ev_path.replace('.json', '.meta.json')))['tail'] if os.path.exists(ev_path.replace('.json', '.meta.json')) else max(e['t'] for e in events) + 6
fx = '' if dry else '''
  [0.0001, [\\s_new, \\pingpong, 902, 1, 900, \\in, 68, \\out, 64, \\revBus, 66]],
  [0.0002, [\\s_new, \\fdn, 903, 1, 900, \\in, 66, \\out, 64]],
  [0.0003, [\\s_new, \\master, 904, 1, 900, \\in, 64, \\out, 0, \\gain, 1.6]],'''
scd = f'''{src}
{{
var ev = [
  [0.0, [\\g_new, 900, 0, 0]],{fx}
{chr(10).join(lines)}
  [{dur!r}, [\\c_set, 0, 0]]
];
Score(~defs.collect {{ |d| [0, [\\d_recv, d.asBytes]] }} ++ ev).sort.recordNRT(nil, "{out_wav}", sampleRate: 48000,
  headerFormat: "WAV", sampleFormat: "float", options: ServerOptions.new.numOutputBusChannels_(2).memSize_(131072).maxNodes_(8192),
  duration: {dur!r}, action: {{ "SC DONE".postln; 0.exit }});
}}.value;
'''
open(out_wav.replace('.wav', '.scd'), 'w').write(scd)

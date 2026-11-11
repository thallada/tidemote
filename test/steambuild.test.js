import test from 'node:test';
import assert from 'node:assert/strict';
import { appBuildVdf } from '../desktop/scripts/steam-build.mjs';

const base = { app: 1234560, content: '/c', output: '/o', depots: { windows: 1234561, linux: 1234563 } };

test('one depot per OS folder, set live on the branch', () => {
  const v = appBuildVdf({ ...base, branch: 'dev', desc: 'v0.2.0 abc' });
  assert.match(v, /"AppID" "1234560"/);
  assert.match(v, /"SetLive" "dev"/);
  assert.match(v, /"1234561"\n\t\t\{\n\t\t\t"FileMapping"\n\t\t\t\{\n\t\t\t\t"LocalPath" "windows\/\*"/);
  assert.match(v, /"LocalPath" "linux\/\*"/);
  assert.match(v, /"Preview" "0"/);
  // braces balance
  assert.equal((v.match(/\{/g) || []).length, (v.match(/\}/g) || []).length);
});

test('quotes and backslashes in the description are escaped', () => {
  const v = appBuildVdf({ ...base, desc: 'say "hi" C:\\x\nnext' });
  assert.match(v, /"Desc" "say \\"hi\\" C:\\\\x next"/);
});

test('refuses the default branch, bad ids and no depots', () => {
  assert.throws(() => appBuildVdf({ ...base, branch: 'default' }));
  assert.throws(() => appBuildVdf({ ...base, app: 'x' }));
  assert.throws(() => appBuildVdf({ ...base, depots: { windows: 'x' } }));
  assert.throws(() => appBuildVdf({ ...base, depots: {} }));
});

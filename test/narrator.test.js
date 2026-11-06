import test from 'node:test';
import assert from 'node:assert/strict';
import { pickVoice, speakable, createNarrator } from '../src/narrator.js';

test('the voice: English, local, a natural reader; never a novelty voice; none without English', () => {
  const v = (name, lang, localService = true) => ({ name, lang, localService });
  assert.equal(pickVoice([v('Thomas', 'fr-FR'), v('Daniel', 'en-GB'), v('Zarvox', 'en-US')]).name, 'Daniel');
  assert.equal(pickVoice([v('Google UK English Male', 'en-GB', false), v('Samantha', 'en-US')]).name, 'Samantha');
  assert.equal(pickVoice([v('Zarvox', 'en-US'), v('Fred', 'en-US')]).name, 'Fred');
  assert.equal(pickVoice([v('Thomas', 'fr-FR')]), null);
  assert.equal(pickVoice([]), null);
});

test('speakable text: no markup, no entities', () => {
  assert.equal(speakable('<b>Never before in this world:</b> a parasite. <a data-serial="3">Thax ka</a> &amp; Mo'), 'Never before in this world: a parasite. Thax ka & Mo');
});

test('the narrator reads one story at a time, the soundtrack stepping back while it does', () => {
  const spoken = [], ducks = [];
  let current = null;
  const synth = { getVoices: () => [{ name: 'Daniel', lang: 'en-GB', localService: true }], speak: (u) => { spoken.push(u.text); current = u; }, cancel: () => { current = null; } };
  function Utterance(text) { this.text = text; }
  const n = createNarrator({ synth, Utterance, duck: (on) => ducks.push(on) });
  assert.ok(n.available);
  n.say('Ignored while off.');
  assert.equal(spoken.length, 0);
  n.on = true;
  n.say('One.'); n.say('Two.'); n.say('Three.'); n.say('Four.');
  assert.deepEqual(spoken, ['One.']);
  assert.equal(current.voice.name, 'Daniel');
  current.onend();
  // (at most two wait: the oldest waiting dropped)
  assert.deepEqual(spoken, ['One.', 'Three.']);
  current.onend(); current.onend();
  assert.deepEqual(spoken, ['One.', 'Three.', 'Four.']);
  assert.equal(ducks[0], true);
  assert.equal(ducks.at(-1), false);
  n.on = false;
  assert.equal(ducks.at(-1), false);
});

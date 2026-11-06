// The narrator (Settings → Audio → Narrator): the chronicler's stories read aloud as they are told, through the
// browser's own speech (the Web Speech API's speechSynthesis), while the soundtrack steps back. With the auto camera,
// which goes to see each story's subject as it is told, the world becomes a documentary. Off by default; where the
// browser has no voices it is not offered.
//
// pickVoice is pure (tested in test/narrator.test.js); createNarrator takes the synthesis object and the page's hooks.

/**
 * The voice to read in: English first (the stories are written in it), then a local voice over a network one (no
 * pause before it speaks, and it works offline), and among those the ones whose names promise a natural reader.
 * voices: [{ name, lang, localService, default }]. Returns one of them, or null.
 */
export function pickVoice(voices, lang = 'en') {
  if (!voices || !voices.length) return null;
  const score = (v) => {
    const l = (v.lang || '').toLowerCase().replace('_', '-'), n = (v.name || '').toLowerCase();
    let s = 0;
    if (l.startsWith(lang)) s += 100;
    if (l === 'en-gb') s += 6; // a narrator of the old school
    if (v.localService) s += 20;
    if (/natural|neural|premium|enhanced|daniel|serena|arthur|george|libby|ryan|sonia/.test(n)) s += 15;
    if (/google/.test(n)) s += 4;
    if (/compact|novelty|whisper|bad news|bells|boing|bubbles|cellos|zarvox|trinoids|albert|jester|organ|superstar|wobble/.test(n)) s -= 80;
    if (v.default) s += 2;
    return s;
  };
  let best = null, bs = -Infinity;
  for (const v of voices) { const s = score(v); if (s > bs) { bs = s; best = v; } }
  return best && bs >= 100 ? best : null;
}

/** Text for speech: no markup, no entities, a story's bold opening ("Never before in this world:") read as the sentence's start. */
export function speakable(text) {
  return String(text || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * createNarrator({ synth, Utterance, duck(on), rate, pitch }): say(text) reads it (a new story waits for the one being
 * read; at most two wait, the oldest dropped), stop() hushes it. synth: window.speechSynthesis (or a test's stand-in).
 */
export function createNarrator({ synth, Utterance, duck = () => {}, rate = 0.94, pitch = 0.92, volume = 1 } = {}) {
  const queue = [];
  let speaking = false, voice = null, on = false;
  const ready = () => !!synth && !!Utterance;
  const refresh = () => { if (ready()) voice = pickVoice(synth.getVoices?.() || []); };
  if (ready() && 'onvoiceschanged' in synth) synth.onvoiceschanged = refresh;
  refresh();
  function next() {
    if (!on || speaking || !queue.length || !ready()) { if (!speaking) duck(false); return; }
    const u = new Utterance(queue.shift());
    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en-GB';
    u.rate = rate; u.pitch = pitch; u.volume = volume;
    speaking = true;
    duck(true);
    const done = () => { speaking = false; next(); };
    u.onend = done; u.onerror = done;
    synth.speak(u);
  }
  return {
    get available() { if (!voice) refresh(); return ready() && !!voice; },
    get on() { return on; },
    set on(v) { on = !!v; if (!on) this.stop(); },
    say(text) {
      const t = speakable(text);
      if (!on || !t) return;
      queue.push(t);
      while (queue.length > 2) queue.shift();
      next();
    },
    stop() { queue.length = 0; if (ready()) synth.cancel(); speaking = false; duck(false); },
  };
}

// The view preferences a tool writes before it loads the page (localStorage 'tidemote.view', read by loadPrefs in
// src/main.js), stamped with the version the page itself saves (PREFS_V in src/main.js): the page drops preferences
// of any other version for its defaults. test/tools.test.js keeps PREFS_V the page's.
export const PREFS_V = 6;

/** The page's view preferences with `prefs` set. */
export const viewPrefs = (prefs = {}) => ({ v: PREFS_V, ...prefs });

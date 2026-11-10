// The view preferences a tool writes before it loads the page (localStorage 'tidemote.view', read by loadPrefs in
// src/main.js), stamped with the version the page itself saves (persist in src/main.js) so the page takes them as its
// own rather than as an older page's to migrate (a frame rate of 60, a density of 1.5 and the light map are read
// differently before 5). test/tool-prefs.test.js keeps PREFS_V the page's.
export const PREFS_V = 5;

/** The page's view preferences with `prefs` set. */
export const viewPrefs = (prefs = {}) => ({ v: PREFS_V, ...prefs });

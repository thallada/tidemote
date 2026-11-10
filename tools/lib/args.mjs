// The two loose command-line readers the page tools share (a tool with a fixed set of options uses node:util parseArgs).

/** --name value pairs (a bare --name is '1'). */
export const cliArgs = () => Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '1']] : a), []));

/** The word after --k, else d. */
export const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };

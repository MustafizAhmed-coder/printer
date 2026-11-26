// The real Python file is loaded as raw text and executed in the browser by Pyodide.
import pySrc from '../../python/consolidator.py?raw';

let pyPromise = null;

export function getPython() {
  if (!pyPromise) {
    pyPromise = (async () => {
      const { loadPyodide } = await import(
        /* @vite-ignore */ 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.mjs'
      );
      const py = await loadPyodide();
      py.FS.writeFile('/home/pyodide/consolidator.py', pySrc);
      await py.runPythonAsync('import sys; sys.path.insert(0, "/home/pyodide"); import consolidator');
      return py;
    })();
  }
  return pyPromise;
}

export async function runPython(spec) {
  const py = await getPython();
  py.globals.set('SPEC_JSON', JSON.stringify(spec));
  const out = await py.runPythonAsync(
    'import json\njson.dumps(consolidator.to_ui_payload(json.loads(SPEC_JSON)))'
  );
  return JSON.parse(out);
}

export { pySrc };

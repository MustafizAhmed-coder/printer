import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { getPython, runPython, pySrc } from './pyRunner.js';

const STEP = 0.9; // seconds between picks in the animation

const randomSpec = (k, maxN) => {
  const spec = {};
  for (let d = 0; d < k; d++) {
    const code = 'D' + String(d + 1).padStart(2, '0');
    const n = Math.floor(Math.random() * (maxN + 1));
    const times = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 20)).sort((a, b) => a - b);
    spec[code] = times.map((t, i) => [`${code}-${i + 1}`, t]);
  }
  return spec;
};

const PRESETS = [
  { label: 'Example', make: () => ({ A: [['A2', 2], ['A7', 7], ['A9', 9]], B: [['B1', 1], ['B7', 7]], C: [['C3', 3], ['C10', 10]] }) },
  { label: 'Ties & empty', make: () => ({ A: [['A5', 5], ['A5b', 5]], B: [], C: [['C5', 5], ['C6', 6]], D: [['D5', 5], ['D9', 9]] }) },
  { label: '12 queues', make: () => randomSpec(12, 6) },
  { label: '200 queues', make: () => randomSpec(200, 8) },
];

const SPEEDS = [0.5, 1, 2, 4];

export default function App() {
  const [spec, setSpec] = useState(null);
  const [payload, setPayload] = useState(null);
  const [status, setStatus] = useState('Starting Python runtime…');
  const [step, setStep] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [tab, setTab] = useState('python');
  const [busy, setBusy] = useState(false);
  const [activePreset, setActivePreset] = useState(0);
  const tlRef = useRef(null);
  const layerRef = useRef(null);

  async function run(s, presetIndex = null) {
    setBusy(true);
    setStatus('Running Python…');
    try {
      const p = await runPython(s);
      setSpec(s);
      setStep(0);
      setPayload(p);
      if (presetIndex !== null) setActivePreset(presetIndex);
      setStatus(`Merged ${p.jobs_out} jobs with Python`);
    } catch (e) {
      setStatus('Python error: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    getPython().then(() => setStatus('Python ready'))
      .catch((e) => setStatus('Python failed to load: ' + e.message));
    run(PRESETS[0].make(), 0);
  }, []);

  // One GSAP timeline per run: each pick flies a job from its queue to its printed slot.
  useLayoutEffect(() => {
    if (!payload) return;
    tlRef.current?.kill();
    if (layerRef.current) layerRef.current.innerHTML = '';
    gsap.set('.job-card', { opacity: 1 });
    const tl = gsap.timeline({ timeScale: speed, onComplete: () => setPaused(true) });
    payload.timeline.forEach(([id], i) => {
      tl.call(() => {
        const card = document.getElementById('card-' + id);
        const slot = document.getElementById('slot-' + i);
        if (card && slot) {
          // Ghost lives in a layer inside the page container, so it is never clipped by the
          // scrolling lanes. Both ends are measured relative to that layer on every frame,
          // because the printed grid moves while the heap panel changes height.
          const layer = layerRef.current;
          const ghost = card.cloneNode(true);
          ghost.id = '';
          ghost.classList.add('ghost');
          Object.assign(ghost.style, { position: 'absolute', margin: '0' });
          layer.appendChild(ghost);
          card.style.opacity = 0.25;
          const p = { t: 0 };
          const rel = (el) => {
            const r = el.getBoundingClientRect();
            const l = layer.getBoundingClientRect();
            return { x: r.left - l.left, y: r.top - l.top };
          };
          const start = rel(card);
          gsap.to(p, {
            t: 1, duration: 0.7, ease: 'power3.inOut',
            onUpdate: () => {
              const end = rel(slot);
              ghost.style.left = start.x + (end.x - start.x) * p.t + 'px';
              ghost.style.top = start.y + (end.y - start.y) * p.t + 'px';
            },
            onComplete: () => {
              // Snap to the final slot in case the layout settled after the last frame.
              const end = rel(slot);
              ghost.style.left = end.x + 'px';
              ghost.style.top = end.y + 'px';
            },
          });
        }
        setStep(i + 1);
      }, [], i * STEP);
    });
    tlRef.current = tl;
    gsap.from('.lane', { opacity: 0, y: 8, stagger: 0.03, duration: 0.35, ease: 'power2.out' });
    setPaused(false);
    return () => tl.kill();
  }, [payload]);

  useEffect(() => { tlRef.current?.timeScale(speed); }, [speed]);

  function togglePlay() {
    const tl = tlRef.current;
    if (!tl) return;
    if (tl.paused()) tl.play(); else tl.pause();
    setPaused(tl.paused());
  }

  function stepOnce() {
    const tl = tlRef.current;
    if (!tl || !payload) return;
    tl.pause();
    setPaused(true);
    if (step < payload.timeline.length) tl.tweenTo(step * STEP + 0.75, { duration: 0.5 });
  }

  function reset() {
    setStep(0);
    setPayload((p) => ({ ...p })); // new object re-runs the timeline effect
  }

  const done = useMemo(
    () => new Set(payload ? payload.timeline.slice(0, step).map((j) => j[0]) : []),
    [payload, step]
  );
  const lanes = useMemo(() => (payload ? Object.entries(payload.inputs) : []), [payload]);
  // Heap view: the current head of every non-empty queue, smallest (time, dept) first.
  const heads = useMemo(() => lanes
    .map(([dept, jobs]) => {
      const h = jobs.find(([id]) => !done.has(id));
      return h ? { id: h[0], time: h[1], dept } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time || (a.dept < b.dept ? -1 : a.dept > b.dept ? 1 : 0)),
  [lanes, done]);
  const headIds = new Set(heads.map((h) => h.id));

  const N = payload?.jobs_in ?? 0;
  const k = lanes.length;
  const naive = N > 1 ? Math.round(N * Math.log2(N)) : 0;
  const heapWork = N > 1 ? Math.round(N * Math.log2(Math.max(k, 2))) : 0;
  const finished = payload && step >= payload.timeline.length;

  const traceText = payload
    ? payload.trace.map((s, i) =>
        `${String(i + 1).padStart(3)}  pick ${s.job.padEnd(8)} t=${s.time}  dept=${s.dept}  heap_left=${s.heap}`
      ).join('\n')
    : '';

  const btn = 'h-9 px-3 border border-neutral-900 text-sm font-medium hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-white';

  return (
    <div className="relative min-h-screen bg-white text-neutral-900 font-sans">
      {/* Top bar */}
      <header className="border-b border-neutral-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex gap-1" aria-hidden>
              <span className="w-3 h-3 bg-red-600" />
              <span className="w-3 h-3 bg-blue-600" />
              <span className="w-3 h-3 bg-yellow-400" />
            </span>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Print Queue Consolidator</h1>
              <p className="text-xs text-neutral-500">Sorted queues → min-heap of heads → one timeline · {status}</p>
            </div>
          </div>
          <button onClick={() => { setTab('python'); setDrawer(true); }}
            className="h-9 px-4 bg-red-600 text-white text-sm font-semibold hover:bg-red-700">
            View source code
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <div className="flex border border-neutral-900">
            {PRESETS.map((p, i) => (
              <button key={p.label} disabled={busy} onClick={() => run(p.make(), i)}
                className={`h-9 px-3 text-sm font-medium border-r border-neutral-900 last:border-r-0 disabled:opacity-40
                  ${activePreset === i ? 'bg-neutral-900 text-white' : 'bg-white hover:bg-neutral-100'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <span className="w-px h-6 bg-neutral-300 mx-2" />
          <button disabled={!payload} onClick={togglePlay}
            className="h-9 px-4 bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40">
            {paused ? 'Play' : 'Pause'}
          </button>
          <button disabled={!payload || finished} onClick={stepOnce} className={btn}>Step</button>
          <button disabled={!payload} onClick={reset} className={btn}>Reset</button>
          <label className="ml-auto flex items-center gap-2 text-sm text-neutral-600">
            Speed
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}
              className="h-9 border border-neutral-900 bg-white px-2 text-sm">
              {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Queues as linked lists */}
          <section className="lg:col-span-2">
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="text-sm font-semibold">Department queues</h2>
              <span className="text-xs text-neutral-500">Each queue is a linked list in time order · blue = waiting, yellow = next to print</span>
            </div>
            <div className="border border-neutral-900 max-h-[65vh] overflow-y-auto divide-y divide-neutral-200">
              {lanes.length === 0 && <div className="p-4 text-sm text-neutral-500">Loading queues…</div>}
              {lanes.map(([dept, jobs]) => (
                <div key={dept} className="lane flex items-center gap-4 px-3 py-2">
                  <div className="w-24 shrink-0">
                    <div className="text-sm font-semibold">Queue {dept}</div>
                    <div className="text-xs text-neutral-500">{jobs.length} job{jobs.length === 1 ? '' : 's'}</div>
                  </div>
                  <div className="flex items-center gap-1 overflow-x-auto py-1">
                    {jobs.length === 0 && <span className="text-xs text-neutral-500">empty · head = NULL</span>}
                    {jobs.map(([id, t], j) => (
                      <Fragment key={id}>
                        {j > 0 && <span className="text-neutral-400 text-xs px-0.5">→</span>}
                        <div id={'card-' + id}
                          className={`job-card shrink-0 w-16 h-11 flex flex-col items-center justify-center text-xs font-mono border
                            ${headIds.has(id)
                              ? 'bg-yellow-400 border-yellow-500 text-neutral-900 font-semibold'
                              : 'bg-blue-600 border-blue-700 text-white'}`}>
                          <span>{id}</span>
                          <span className="text-[10px] opacity-80">t={t}</span>
                        </div>
                      </Fragment>
                    ))}
                    <span className="text-neutral-400 text-xs ml-1">→ NULL</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <aside className="space-y-6">
            {/* Min-heap of heads */}
            <section>
              <h2 className="text-sm font-semibold mb-2">Merge heap</h2>
              <p className="text-xs text-neutral-500 mb-3">
                Holds only the head of each queue. The smallest (time, then dept code) leaves next.
              </p>
              <div className="flex flex-col border border-neutral-900 divide-y divide-neutral-200 h-44 overflow-y-auto">
                {heads.length === 0 && payload && (
                  <div className="px-3 py-2 text-sm">Heap empty. All {payload.jobs_out} jobs merged.</div>
                )}
                {heads.map((h, i) => (
                  <div key={h.id} className={`flex items-center justify-between px-3 py-2 text-sm font-mono
                    ${i === 0 ? 'bg-yellow-400 font-semibold' : ''}`}>
                    <span>{h.id}</span>
                    <span className="text-xs">t={h.time} · {h.dept}{i === 0 ? ' · next' : ''}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Printed timeline */}
            <section>
              <h2 className="text-sm font-semibold mb-2">Printed timeline</h2>
              <div className="grid grid-cols-4 gap-2">
                {payload?.timeline.map((_, i) => (
                  <div key={i} id={'slot-' + i}
                    className="h-11 border border-neutral-300 flex items-center justify-center text-[10px] text-neutral-400 font-mono">
                    {i + 1}
                  </div>
                ))}
              </div>
            </section>

            {/* Merge report */}
            <section>
              <h2 className="text-sm font-semibold mb-2">Merge report</h2>
              <table className="w-full text-sm border-t border-neutral-900">
                <tbody className="divide-y divide-neutral-200">
                  <tr><td className="py-1.5 text-neutral-600">Jobs received</td><td className="py-1.5 text-right font-mono">{payload?.jobs_in ?? '–'}</td></tr>
                  <tr><td className="py-1.5 text-neutral-600">Jobs produced</td><td className="py-1.5 text-right font-mono">{payload?.jobs_out ?? '–'}</td></tr>
                  <tr><td className="py-1.5 text-neutral-600">Queues (k)</td><td className="py-1.5 text-right font-mono">{k}</td></tr>
                  <tr><td className="py-1.5 text-neutral-600">Heap ops (measured)</td><td className="py-1.5 text-right font-mono">{payload?.heap_ops ?? '–'}</td></tr>
                  <tr><td className="py-1.5 text-neutral-600">N·log₂k (model)</td><td className="py-1.5 text-right font-mono">{heapWork}</td></tr>
                  <tr><td className="py-1.5 text-neutral-600">N·log₂N (re-sort all)</td><td className="py-1.5 text-right font-mono">{naive}</td></tr>
                </tbody>
              </table>
            </section>
          </aside>
        </div>
      </div>

      {/* Flight layer for the animated jobs. Children are managed by GSAP, not React. */}
      <div ref={layerRef} className="absolute inset-0 z-40 pointer-events-none" />

      {/* Source code drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => setDrawer(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className="h-full w-full max-w-2xl bg-white border-l border-neutral-900 flex flex-col">
            <div className="flex items-center justify-between border-b border-neutral-900 px-5 h-14">
              <div className="flex">
                {[['python', 'Python source'], ['exec', 'Execution trace']].map(([key, label]) => (
                  <button key={key} onClick={() => setTab(key)}
                    className={`h-14 px-4 text-sm font-medium border-b-2 -mb-px
                      ${tab === key ? 'border-red-600 text-neutral-900' : 'border-transparent text-neutral-500 hover:text-neutral-900'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <button onClick={() => setDrawer(false)} className="text-sm text-neutral-600 hover:text-neutral-900">Close</button>
            </div>

            <div className="flex-1 overflow-auto p-5">
              {tab === 'python' ? (
                <>
                  <p className="text-xs text-neutral-500 mb-3">consolidator.py. This exact file runs in your browser through Pyodide.</p>
                  <pre className="text-xs leading-5 bg-neutral-950 text-neutral-100 p-4 overflow-x-auto">{pySrc}</pre>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-3">
                    <button disabled={busy || !spec} onClick={() => run(spec)}
                      className="h-9 px-4 bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40">
                      Run again in Python
                    </button>
                    <span className="text-xs text-neutral-500">{status}</span>
                  </div>
                  <p className="text-xs text-neutral-600 mb-3 font-mono">
                    Input: {lanes.map(([d, j]) => `${d}=${j.length}`).join('  ')}
                  </p>
                  <pre className="text-xs leading-5 bg-neutral-950 text-yellow-300 p-4 overflow-x-auto whitespace-pre">
{`$ merge(queues, trace)
${traceText}

report: ${payload?.report ?? ''}`}
                  </pre>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

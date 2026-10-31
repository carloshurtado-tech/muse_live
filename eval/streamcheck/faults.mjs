// Fault schedule for the Stream Check eval: the single ground-truth table
// shared by the fault server, the synth signals and the harness. Every eval
// row logs its window next to the verdict, so rates are computed from logs.
export const RUN_SEC = 30;
export const SAMPLE_DT = 1; // one scored sample per second per cell
export const WINDOW = { start: 10, end: 20 }; // fault on during [start, end)

export const FAULTS = [
  { type: 'clean', label: 'Clean control (must pass)' },
  { type: 'black', label: 'Black-frame window', ...WINDOW },
  { type: 'frozen', label: 'Frozen picture (10 s)', ...WINDOW },
  { type: 'muted', label: 'Audio drop (10 s)', ...WINDOW },
  { type: 'down', label: 'Feed down (playlist 503)', ...WINDOW },
];

export const STREAMS = [
  { id: 'bright', label: 'Bright moving program' },
  { id: 'dark-live', label: 'Dark but live program' },
  { id: 'low-motion', label: 'Low-motion live program' },
];

export function inWindow(fault, t) {
  return fault.type !== 'clean' && t >= fault.start && t < fault.end;
}

export function truthOf(fault, t) {
  return inWindow(fault, t) ? 'fault' : 'clean';
}

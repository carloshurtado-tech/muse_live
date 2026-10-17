// Fresh shared-storage state for every run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
export default async function () {
  try { fs.rmSync(path.join(os.tmpdir(), 'muse-e2e-kv-' + (process.env.E2E_PORT || 8898) + '.json')); } catch {}
}

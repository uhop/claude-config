// Where a claimed triage pass leaves its worksheet and its report — derived
// from the holder alone, so vault-sweep.mjs finds a pass's report without the
// path travelling through the dispatching agent (skip-floor, filed 2026-09-06).

import {join} from 'node:path';
import {tmpdir} from 'node:os';

const safe = holder => holder.replace(/[^a-zA-Z0-9._-]/g, '_');

export const worksheetPathFor = holder => join(tmpdir(), `vault-triage-${safe(holder)}.json`);
export const reportPathFor = holder => join(tmpdir(), `vault-triage-${safe(holder)}.report.json`);

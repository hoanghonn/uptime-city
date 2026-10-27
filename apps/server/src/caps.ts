export type Kind = 'command' | 'rival' | 'tts'
type Opts = { maxRuns?: number; maxCommands?: number; maxRivals?: number; maxTts?: number; now?: () => number }
const QUIET_MS = 5 * 60_000

/** Per-run limits for the public demo. A run is one attempt at a stage, identified by the browser's x-run-id. */
export class RunLimits {
  private runs = new Map<string, { last: number; counts: Record<Kind, number> }>()
  constructor(private opts: Opts) {}

  private now() { return (this.opts.now ?? Date.now)() }

  take(runId: string, kind: Kind): 'ok' | 'city_full' | 'run_limit' {
    const now = this.now()
    for (const [id, r] of this.runs) if (now - r.last > QUIET_MS) this.runs.delete(id)
    let run = this.runs.get(runId)
    if (!run) {
      if (this.runs.size >= (this.opts.maxRuns ?? 10)) return 'city_full'
      run = { last: now, counts: { command: 0, rival: 0, tts: 0 } }
      this.runs.set(runId, run)
    }
    const max = { command: this.opts.maxCommands ?? 20, rival: this.opts.maxRivals ?? 6, tts: this.opts.maxTts ?? 40 }[kind]
    if (run.counts[kind] >= max) return 'run_limit'
    run.counts[kind]++
    run.last = now
    return 'ok'
  }
}

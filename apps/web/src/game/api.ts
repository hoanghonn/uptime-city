import type { City, HeroClass } from '@uptime/core'
import type { CommandResponse, Rival } from './flow'

export class LowPowerError extends Error {}
export class BusyError extends Error {}

let runId = crypto.randomUUID()
/** One run per attempt at a stage; the server caps orders per run. */
export const newRun = () => { runId = crypto.randomUUID() }

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-run-id': runId },
    body: JSON.stringify(body),
  })
  if (res.status === 503) throw new LowPowerError('low power')
  if (res.status === 429) throw new BusyError((await res.json().catch(() => ({}))).message ?? 'The city is full, try again in a minute.')
  if (!res.ok) throw new Error(`${url} ${res.status}`)
  return res.json() as Promise<T>
}

export const postCommand = (body: { stageId: string; heroClass: HeroClass; city: City; transcript: string; phase: 'build' | 'firefight' }) =>
  post<CommandResponse>('/api/command', body)

export const postRival = (stageId: string) => post<Rival>('/api/rival', { stageId })

export async function getStatus(): Promise<'full' | 'low-power'> {
  try {
    const res = await fetch('/api/status')
    return (await res.json()).mode === 'low-power' ? 'low-power' : 'full'
  } catch {
    return 'full'
  }
}

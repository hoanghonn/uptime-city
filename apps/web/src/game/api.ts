import type { City, HeroClass } from '@uptime/core'
import type { CommandResponse, Rival } from './flow'

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${url} ${res.status}`)
  return res.json() as Promise<T>
}

export const postCommand = (body: { stageId: string; heroClass: HeroClass; city: City; transcript: string; phase: 'build' | 'firefight' }) =>
  post<CommandResponse>('/api/command', body)

export const postRival = (stageId: string) => post<Rival>('/api/rival', { stageId })

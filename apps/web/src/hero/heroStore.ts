import type { HeroClass } from '@uptime/core'

export type SavedHero = { nickname: string; heroClass: HeroClass; quirk: string; catchphrase: string; portrait?: string }

const KEY = 'uptime.hero'

/** The hero card lives only in this browser. The CV itself is never kept anywhere. */
export function saveHero(hero: SavedHero): void {
  try { localStorage.setItem(KEY, JSON.stringify(hero)) } catch { /* storage full or blocked: keep it for this session only */ }
}
export function loadHero(): SavedHero | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const h = JSON.parse(raw)
    return typeof h?.nickname === 'string' && typeof h?.heroClass === 'string' ? h : null
  } catch {
    return null
  }
}
export function clearHero(): void {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}

export function playerId(): string {
  try {
    let id = localStorage.getItem('uptime.player')
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('uptime.player', id) }
    return id
  } catch {
    return 'anonymous'
  }
}

export const SAMPLE_CVS = [
  {
    label: 'Backend engineer',
    text: 'Mai Example (fictional sample CV). Backend engineer, 5 years. Built order and payment services in Go and Postgres for an online grocery app. Ran the on-call rotation, wrote the runbook for database failover, migrated batch jobs to a Kafka pipeline. Likes: rock climbing, sourdough, very long log files.',
  },
  {
    label: 'Frontend developer',
    text: 'Tuan Example (fictional sample CV). Frontend and mobile developer, 3 years. React and React Native for a travel booking app. Cut page load time in half with image CDNs, lazy loading and edge caching. Built a design system. Likes: photography, street food tours, shaving milliseconds.',
  },
  {
    label: 'Student',
    text: 'Linh Example (fictional sample CV). Final-year computer science student. Built a campus timetable app with friends, a Discord bot, and a small game for a 48-hour game jam. Teaching assistant for Introduction to Programming. Likes: board games, badminton, learning a new thing every week.',
  },
]

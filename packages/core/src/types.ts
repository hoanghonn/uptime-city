export type BuildingType = 'lb' | 'api' | 'cache' | 'sql' | 'nosql' | 'queue' | 'worker' | 'cdn' | 'storage'
export type HeroClass = 'data_keeper' | 'edge_runner' | 'firefighter' | 'generalist'
export type StageId = 'shorty' | 'chatter' | 'feed' | 'ticket_rush'

export type Building = { id: string; type: BuildingType; option: string; addons: string[] }
export type Link = { from: string; to: string }
export type City = {
  buildings: Building[]
  links: Link[]
  coins: number
  wildcardUsed: boolean
  freeReplicaUsed: boolean
}

export type Action =
  | { kind: 'place'; type: BuildingType; option: string; wildcard?: boolean }
  | { kind: 'insert'; type: BuildingType; option: string; after: string; wildcard?: boolean }
  | { kind: 'addon'; building: string; addon: string }
  | { kind: 'link'; from: string; to: string }
  | { kind: 'unlink'; from: string; to: string }
  | { kind: 'remove'; building: string }

export type ChaosCard =
  | { id: string; title: string; at: number; kind: 'hot_key'; extraRps: number }
  | { id: string; title: string; at: number; kind: 'surge'; multiplier: number }
  | { id: string; title: string; at: number; kind: 'kill'; target: BuildingType }
  | { id: string; title: string; at: number; kind: 'write_spike'; extraWrites: number }

export type Stage = {
  id: StageId
  title: string
  brief: string
  budget: number
  baseLoad: { rps: number; readRatio: number }
  unlocked: BuildingType[]
  wildcard?: BuildingType
  chaos: ChaosCard[]
  rivalName: string
  rivalTaunt: string
  rivalClass: HeroClass
  rivalBlindSpot: string
  rivalScripted: Action[]
  rivalMaxServed: number
  textbookDefaults: Record<string, string>
}

export type ActionContext = { stage: Stage; heroClass: HeroClass }
export type ActionResult = { ok: true; city: City } | { ok: false; reason: string }

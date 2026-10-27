export type BuildingType = 'lb' | 'api' | 'cache' | 'sql' | 'nosql' | 'queue' | 'worker' | 'cdn' | 'storage'
export type HeroClass = 'data_keeper' | 'edge_runner' | 'firefighter' | 'generalist'
export type StageId = string

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
  | { id: string; title: string; at: number; kind: 'bots'; extraRps: number }
  | { id: string; title: string; at: number; kind: 'payments_down'; duration: number }

export type Stage = {
  id: StageId
  title: string
  brief: string
  budget: number
  /** mediaShare: the part of reads that are photos and other big files */
  baseLoad: { rps: number; readRatio: number; mediaShare?: number }
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
  /** a build that should clear the stage; tests check it beats the scripted rival */
  reference?: Action[]
  /** field guide entries that explain this stage */
  guide?: string[]
  /** 'campaign' stages form the main path; 'classic' ones are the well-known interview problems */
  track?: 'academy' | 'campaign' | 'classic'
  /** false: no pause for a firefight command at the chaos card (Academy experiments) */
  firefight?: boolean
  /** Academy only: the question, the two designs, and the moments to compare */
  experiment?: Experiment
}

export type Experiment = {
  question: string
  /** true when each choice should win at least one moment */
  twoSided: boolean
  tradeoff: string
  choices: { label: string; pitch: string; build: Action[] }[]
  moments: { label: string; from: number; to: number }[]
}

export type ActionContext = { stage: Stage; heroClass: HeroClass }
export type ActionResult = { ok: true; city: City } | { ok: false; reason: string }

export const HERO_DEMO_STAGES = ['exchange', 'evidence', 'patterns', 'response']

export function nextHeroDemoStage(stage) {
  const index = HERO_DEMO_STAGES.indexOf(stage)
  if (index < 0) throw new TypeError('Unknown hero demo stage.')
  return HERO_DEMO_STAGES[(index + 1) % HERO_DEMO_STAGES.length]
}

export function initialHeroDemoStage(reducedMotion) {
  return reducedMotion ? 'response' : 'exchange'
}

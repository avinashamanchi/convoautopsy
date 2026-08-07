import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const fromRoot = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('customer-facing product truth', () => {
  it('uses educational estimate and reflection language without clinical, intent, certainty, or guaranteed-response claims', async () => {
    const marketingFiles = await Promise.all([
      fromRoot('src/pages/LandingPage.jsx'),
      fromRoot('src/components/Onboarding.jsx'),
    ])
    const renderedEstimateFiles = await Promise.all([
      fromRoot('src/components/AnalysisResult.jsx'),
      fromRoot('src/components/DiagnosisPanel.jsx'),
    ])
    const marketingCopy = marketingFiles.join('\n')
    const allCustomerCopy = [...marketingFiles, ...renderedEstimateFiles].join('\n')

    expect(marketingCopy).toMatch(/educational/i)
    expect(marketingCopy).toMatch(/estimate/i)
    expect(marketingCopy).toMatch(/reflect/i)
    expect(marketingCopy).not.toMatch(/\bdiagnos(?:e|es|is|tic|tics)\b/i)
    expect(marketingCopy).not.toMatch(/\bclinician\b|therapists? use/i)
    expect(allCustomerCopy).not.toMatch(/hidden meanings?|actually meant|reveals which ego state|tells you who escalated/i)
    expect(allCustomerCopy).not.toMatch(/know exactly|perfect response|every message gets flagged|\bverdict\b|\bguarantee(?:d|s)?\b/i)
    expect(allCustomerCopy).not.toMatch(/predictors? of relationship failure|identifies your conflict style|actual science-backed/i)
    expect(renderedEstimateFiles.join('\n')).toMatch(/possible interpretation/i)
    expect(renderedEstimateFiles.join('\n')).toMatch(/not a clinical diagnosis or factual finding/i)
  })

  it('documents pseudonymous participant labels and residual identifiers in retained message text', async () => {
    const readme = await fromRoot('README.md')

    expect(readme).toMatch(/participant labels are pseudonymous/i)
    expect(readme).toMatch(/may still (?:contain|include) emails, phone numbers, (?:third-party )?names, and context/i)
    expect(readme).toMatch(/review(?:ed)? and redact(?:ed|ion)/i)
    expect(readme).not.toMatch(/anonymized message text|automatically anonymized/i)
  })

  it('ships the public web app as a browser-local guest profile without fake account credentials', async () => {
    const [app, storage, readme, privacy] = await Promise.all([
      fromRoot('src/App.jsx'),
      fromRoot('src/utils/storage.js'),
      fromRoot('README.md'),
      fromRoot('public/privacy.html'),
    ])
    const deployedSources = `${app}\n${storage}`

    expect(deployedSources).not.toMatch(/AuthPage|registerUser|loginUser|password|ca_users/)
    expect(`${readme}\n${privacy}`).toMatch(/browser-local (?:guest )?profile/i)
    expect(`${readme}\n${privacy}`).toMatch(/no (?:backend|ConvoAutopsy) account/i)
    expect(`${readme}\n${privacy}`).toMatch(/cannot recall.*(?:provider|backup)/is)
    expect(`${readme}\n${privacy}`).toMatch(/does not cancel.*App Store subscription/is)
  })
})

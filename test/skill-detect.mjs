import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectSkill, detectSkillViaRegistry, registeredWorkspaceDirs } from '../index.js'

const project = mkdtempSync(join(tmpdir(), 'dsh-zsearch-skill-agents-'))
const projectDsh = mkdtempSync(join(tmpdir(), 'dsh-zsearch-skill-dsh-'))
try {
  const agentsSkillDir = join(project, '.agents', 'skills', 'zhihu')
  mkdirSync(agentsSkillDir, { recursive: true })
  writeFileSync(join(agentsSkillDir, 'SKILL.md'), '# zhihu\n')
  writeFileSync(join(agentsSkillDir, 'manifest.json'), JSON.stringify({
    version: '9.9.9-test',
    cli: { min_version: '0.6.1' },
  }))

  const found = detectSkill([project])
  assert.equal(found.found, true, 'workspace .agents Skill is detected')
  assert.equal(found.path, agentsSkillDir)
  assert.equal(found.version, '9.9.9-test')
  assert.equal(found.minCli, '0.6.1')

  const dshSkillDir = join(projectDsh, '.dsh', 'skills', 'zhihu')
  mkdirSync(dshSkillDir, { recursive: true })
  writeFileSync(join(dshSkillDir, 'manifest.json'), JSON.stringify({ version: '8.8.8-test' }))
  const foundDsh = detectSkill([projectDsh])
  assert.equal(foundDsh.found, true, 'workspace .dsh Skill is detected')
  assert.equal(foundDsh.path, dshSkillDir)

  const skillCtx = {
    get(name) {
      if (name !== 'skills') return undefined
      return {
        async list({ cwd }) {
          if (cwd !== project) return []
          return [{
            name: 'zhihu',
            path: join(agentsSkillDir, 'SKILL.md'),
            source: 'project-agents',
            provider: 'filesystem',
          }]
        },
      }
    },
  }
  const viaRegistry = await detectSkillViaRegistry(skillCtx, [project])
  assert.equal(viaRegistry.found, true, 'DSH skill registry is authoritative')
  assert.equal(viaRegistry.path, agentsSkillDir)
  assert.equal(viaRegistry.version, '9.9.9-test')
  assert.equal(viaRegistry.source, 'project-agents')

  const ctx = {
    get(name) {
      if (name === 'workspaceRegistry') return { list: () => [{ path: project }, { path: '' }] }
      return undefined
    },
  }
  assert.deepEqual(registeredWorkspaceDirs(ctx), [project])

  const unavailable = { get() { throw new Error('service unavailable') } }
  assert.deepEqual(registeredWorkspaceDirs(unavailable), [], 'missing registry is non-fatal')
  assert.equal(await detectSkillViaRegistry({ get: () => undefined }, [project]), null)
  console.log('skill workspace checks ok')
} finally {
  rmSync(project, { recursive: true, force: true })
  rmSync(projectDsh, { recursive: true, force: true })
}

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectSkill, registeredWorkspaceDirs } from '../index.js'

const project = mkdtempSync(join(tmpdir(), 'dsh-zsearch-skill-'))
try {
  const skillDir = join(project, '.agents', 'skills', 'zhihu')
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(join(skillDir, 'manifest.json'), JSON.stringify({
    version: '9.9.9-test',
    cli: { min_version: '0.6.1' },
  }))

  const found = detectSkill([project])
  assert.equal(found.found, true, 'workspace Skill is detected')
  assert.equal(found.path, skillDir)
  assert.equal(found.version, '9.9.9-test')
  assert.equal(found.minCli, '0.6.1')

  const ctx = {
    get(name) {
      if (name === 'workspaceRegistry') return { list: () => [{ path: project }, { path: '' }] }
      return undefined
    },
  }
  assert.deepEqual(registeredWorkspaceDirs(ctx), [project])

  const unavailable = { get() { throw new Error('service unavailable') } }
  assert.deepEqual(registeredWorkspaceDirs(unavailable), [], 'missing registry is non-fatal')
  console.log('skill workspace checks ok')
} finally {
  rmSync(project, { recursive: true, force: true })
}

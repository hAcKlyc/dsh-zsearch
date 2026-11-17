import assert from 'node:assert/strict'
import { posix, win32 } from 'node:path'
import { cliCandidates, psLiteral } from '../index.js'

const windowsEnv = {
  USERPROFILE: 'C:\\Users\\18722',
  LOCALAPPDATA: 'C:\\Users\\18722\\AppData\\Local',
  ZHIHU_CLI_HOME: 'D:\\Zhihu',
}
const candidates = cliCandidates('', {
  platform: 'win32',
  env: windowsEnv,
  home: windowsEnv.USERPROFILE,
  joinPath: win32.join,
})
assert.ok(
  candidates.includes(win32.join(windowsEnv.LOCALAPPDATA, 'ZhihuCLI', 'current', 'zhihu-cli.exe')),
  'LOCALAPPDATA install target is probed',
)
assert.ok(
  candidates.includes(win32.join(windowsEnv.ZHIHU_CLI_HOME, 'current', 'zhihu-cli.exe')),
  'ZHIHU_CLI_HOME uses the .exe binary name',
)
assert.ok(candidates.includes('zhihu-cli.exe'), 'PATH probe uses the Windows binary name')
assert.ok(!candidates.some((candidate) => candidate.includes('Library')), 'Windows does not probe macOS paths')

const userProfileOnly = cliCandidates('', {
  platform: 'win32',
  env: { USERPROFILE: 'C:\\Users\\fallback' },
  joinPath: win32.join,
})
assert.ok(
  userProfileOnly.includes(win32.join('C:\\Users\\fallback', 'AppData', 'Local', 'ZhihuCLI', 'current', 'zhihu-cli.exe')),
  'USERPROFILE is used when HOME is absent and LOCALAPPDATA is unavailable',
)

const macCandidates = cliCandidates('', {
  platform: 'darwin',
  env: { HOME: '/Users/ethan' },
  home: '/Users/ethan',
  joinPath: posix.join,
})
assert.ok(
  macCandidates.includes(posix.join('/Users/ethan', 'Library', 'Application Support', 'zhihu-cli', 'current', 'zhihu-cli')),
  'macOS path still works',
)
assert.ok(!macCandidates.some((candidate) => candidate.endsWith('.exe')), 'macOS does not probe .exe')

assert.equal(
  psLiteral("C:\\Users\\O'Brien\\skill.zip"),
  "'C:\\Users\\O''Brien\\skill.zip'",
  'single quotes in Windows paths are escaped for PowerShell',
)
console.log('windows path checks ok')

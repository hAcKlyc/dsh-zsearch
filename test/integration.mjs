import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../index.js'

const FAKE_CLI = `#!/usr/bin/env node
const args = process.argv.slice(2)
if (args[0] === 'version') {
  console.log(JSON.stringify({ version: '0.0.0-test', os: process.platform, arch: process.arch }))
  process.exit(0)
}
const kind = args[1]
const n = 6
const items = Array.from({ length: n }, (_, i) => {
  const k = i + 1
  if (kind === 'zhihu') {
    return {
      Title: '测试知乎问题 ' + k,
      AuthorName: '答主' + k,
      AuthorAvatar: '',
      AuthorBadgeText: '',
      VoteUpCount: 100 - i,
      CommentCount: i,
      ContentText: '这是第' + k + '条知乎回答里最核心的结论，安装前必须先配置工作区。补充说明第' + k + '条的背景信息。',
      Url: 'https://www.zhihu.com/question/' + k + '/answer/' + k,
      ContentType: 'Answer',
    }
  }
  return {
    Title: '测试网页 ' + k,
    AuthorName: '',
    AuthorAvatar: '',
    AuthorBadgeText: '',
    VoteUpCount: 0,
    CommentCount: 0,
    ContentText: '这是第' + k + '条网页给出的核心结论，官方文档写明了安装步骤。更多第' + k + '条说明。',
    Url: 'https://site' + k + '.example.com/doc/' + k,
    ContentType: 'Article',
  }
})
console.log(JSON.stringify({ Code: 0, Data: { Items: items } }))
`

function textOf(message) {
  return String(message?.content?.[0]?.text ?? '')
}

function curationCandidates(prompt) {
  const rows = []
  const re = /#(\d+) \[[^\]]*\] ([^\n]*)\n([^\n]*)/g
  let match
  while ((match = re.exec(prompt)) !== null) {
    rows.push({ id: Number(match[1]), title: match[2], text: match[3] })
  }
  return rows
}

function answerEvidence(prompt) {
  const rows = []
  const re = /\[(\d+)\] [^\n]*｜([^\n]*)\n正文：([^\n]*)/g
  let match
  while ((match = re.exec(prompt)) !== null) {
    rows.push({ id: Number(match[1]), title: match[2], text: match[3] })
  }
  return rows
}

function backfillItems(prompt) {
  const rows = []
  const re = /#(\d+) ([^\n]*)\n正文：([^\n]*)\n答案句子：/g
  let match
  while ((match = re.exec(prompt)) !== null) {
    rows.push({ id: Number(match[1]), title: match[2], text: match[3] })
  }
  return rows
}

function firstSentences(text, count = 2) {
  return String(text).split(/(?<=[。！？!?])/).filter(Boolean).slice(0, count).join('').trim()
}

function makeLlm(calls, behavior = {}) {
  let answerAttempts = 0
  const base = {
    ...(behavior.modelInfo !== undefined ? {
      async resolveModelInfo() {
        if (behavior.modelInfo instanceof Error) throw behavior.modelInfo
        return behavior.modelInfo
      },
    } : {}),
    stream(options) {
      if (Array.isArray(behavior.rejectEfforts) && behavior.rejectEfforts.includes(options.reasoningEffort)) {
        throw new Error(`provider "${options.provider}" model "${options.model}" does not support reasoning effort "${options.reasoningEffort}"`)
      }
      if (behavior.rejectAnyEffort && options.reasoningEffort !== undefined) {
        throw new Error(`provider "${options.provider}" model "${options.model}" does not support reasoning effort "${options.reasoningEffort}"`)
      }
      calls.efforts ??= []
      calls.efforts.push(options.reasoningEffort)
      const system = String(options.system ?? '')
      return (async function* () {
        if (system.includes('改写成')) {
          calls.expand += 1
          yield { type: 'text-delta', text: '测试问题 安装 配置\nDSH plugin install guide' }
          return
        }
        if (system.includes('检索结果的编辑') && system.includes('插件评测')) {
          calls.curate += 1
          calls.curateMaxTokens = options.maxTokens
          const rows = curationCandidates(textOf(options.messages?.[0]))
          if (rows.length < 2) return
          const [a, b] = rows
          yield {
            type: 'text-delta',
            text: JSON.stringify({
              topic: '这个插件值不值得装？',
              groups: [
                { label: '真实体验', question: '装过的人怎么评价？', items: [{ i: a.id, quote: firstSentences(a.text) }] },
                { label: '局限与风险', question: '最容易踩的坑是什么？', items: [{ i: b.id, quote: firstSentences(b.text) }] },
              ],
            }),
          }
          return
        }
        if (system.includes('检索结果的编辑')) {
          calls.curate += 1
          calls.curateMaxTokens = options.maxTokens
          if (behavior.curateFail) return
          if (behavior.curateDelayMs) await new Promise((resolve) => setTimeout(resolve, behavior.curateDelayMs))
          const rows = curationCandidates(textOf(options.messages?.[0]))
          if (rows.length < 2) return
          const [a, b] = rows
          yield {
            type: 'text-delta',
            text: [
              '主题|测试问题：怎么装、注意什么？',
              '组|安装|装之前要做什么？',
              `${a.id}|${firstSentences(a.text)}`,
              '组|避坑|有哪些容易踩的坑？',
              `${b.id}|${firstSentences(b.text)}`,
            ].join('\n'),
          }
          return
        }
        if (system.includes('ZSearch 的回答编辑') || system.includes('ZSearch 的插件评测编辑')) {
          calls.answer += 1
          calls.answerEffort = options.reasoningEffort
          calls.answerMaxTokens = options.maxTokens
          answerAttempts += 1
          if (behavior.emptyOnce && answerAttempts === 1) {
            yield {
              type: 'finish',
              reason: {
                kind: behavior.emptyFinish ?? 'error',
                failure: { message: 'transient failure', code: 'MOCK' },
              },
            }
            return
          }
          const rows = answerEvidence(textOf(options.messages?.[0]))
          if (!rows.length) {
            yield { type: 'text-delta', text: '检索到的资料不足以判断。' }
            yield { type: 'finish', reason: { kind: 'stop' } }
            return
          }
          const first = rows[0].id
          const last = rows[rows.length - 1].id
          const cites = behavior.answerFirstOnly || rows.length < 2 ? [first] : [first, last]
          const text = '先给结论：安装前要先配置工作区['
            + cites[0] + ']。'
            + (cites[1] ? '官方文档也给出了完整步骤和版本要求[' + cites[1] + ']。' : '')
            + '整体上按文档顺序执行即可。'
            + (behavior.answerExtra ? '这一条没有对应来源[999]。' : '')
          for (let i = 0; i < text.length; i += 9) {
            yield { type: 'text-delta', text: text.slice(i, i + 9) }
          }
          yield {
            type: 'finish',
            reason: behavior.answerFinish
              ? { kind: behavior.answerFinish, failure: { message: behavior.answerFinishMessage ?? 'mock failure', code: 'MOCK' } }
              : { kind: 'stop' },
          }
          return
        }
        if (system.includes('引用核对员')) {
          calls.backfill += 1
          if (behavior.backfillFail) return
          const rows = backfillItems(textOf(options.messages?.[0]))
          yield {
            type: 'text-delta',
            text: rows.map((row) => `${row.id}|${firstSentences(row.text)}`).join('\n'),
          }
          return
        }
        throw new Error('unexpected system prompt')
      })()
    },
  }
  return base
}

function makeCtx(llm, manager) {
  const state = { registered: null }
  const ctx = {
    get(name) {
      if (name === 'llm') return llm
      if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'mock', model: 'mock' }) }
      if (name === 'pluginManager') return manager
      return undefined
    },
    effect(fn) { fn() },
    webServer: {
      register(options) { state.registered = options; return () => {} },
    },
  }
  return { ctx, state }
}

function runSse(handler, url, timeoutMs = 25_000) {
  return new Promise((resolve, reject) => {
    const events = []
    let buffer = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error(`SSE timeout: ${url}`))
    }, timeoutMs)
    const res = {
      status: 0,
      headers: null,
      writeHead(status, headers) { this.status = status; this.headers = headers },
      write(chunk) {
        buffer += String(chunk)
        let cut
        while ((cut = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, cut)
          buffer = buffer.slice(cut + 2)
          const event = { name: '', data: null }
          for (const line of block.split('\n')) {
            if (line.startsWith('event: ')) event.name = line.slice(7)
            else if (line.startsWith('data: ')) event.data = JSON.parse(line.slice(6))
          }
          if (event.name) events.push(event)
        }
      },
      end() {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({ status: res.status, events })
      },
    }
    const req = { url, method: 'GET', socket: { remoteAddress: '127.0.0.1' }, on() {} }
    handler(req, res).catch((error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })
  })
}

function runJson(handler, url) {
  return new Promise((resolve, reject) => {
    let body = ''
    const res = {
      writeHead() {},
      write(chunk) { body += String(chunk) },
      end(chunk) {
        if (chunk !== undefined) body += String(chunk)
        try { resolve(JSON.parse(body)) } catch (error) { reject(error) }
      },
    }
    const req = { url, method: 'GET', socket: { remoteAddress: '127.0.0.1' }, on() {} }
    handler(req, res).catch(reject)
  })
}

function runPost(handler, url, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    let body = ''
    const res = {
      writeHead() {},
      write(chunk) { body += String(chunk) },
      end(chunk) {
        if (chunk !== undefined) body += String(chunk)
        try { resolve(JSON.parse(body)) } catch (error) { reject(error) }
      },
    }
    const chunks = [Buffer.from(JSON.stringify(payload ?? {}))]
    const req = {
      url, method: 'POST', headers, socket: { remoteAddress: '127.0.0.1' },
      async *[Symbol.asyncIterator]() { for (const chunk of chunks) yield chunk },
    }
    handler(req, res).catch(reject)
  })
}

function byName(events, name) {
  return events.filter((event) => event.name === name).map((event) => event.data)
}

function cards(events) {
  return byName(events, 'card')
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'zsearch-test-'))
  const cli = join(dir, 'zhihu-cli.mjs')
  writeFileSync(cli, FAKE_CLI)
  chmodSync(cli, 0o755)

  const calls = { expand: 0, curate: 0, answer: 0, backfill: 0 }
  const llm = makeLlm(calls)
  const installs = []
  const manager = {
    inspect: async (spec) => ({ status: 'accepted', name: spec, version: '0.1.0' }),
    installBundle: async (spec, options) => {
      installs.push({ spec, options })
      return { application: 'applied', changed: true, stage: 'enable', target: 'mock', version: '0.1.0', bundle: 'mock', pendingBuilds: [], warnings: [] }
    },
  }
  const { ctx, state } = makeCtx(llm, manager)
  apply(ctx, { cliPath: cli, cacheMinutes: 10, debug: false })
  assert.ok(state.registered, 'webServer.register was called')
  const handler = state.registered.handler

  const query = encodeURIComponent('测试问题')
  const first = await runSse(handler, `/zsearch/api/stream?q=${query}`)
  assert.equal(first.status, 200)

  const plan = byName(first.events, 'plan')[0]
  assert.ok(plan, 'plan event')
  assert.equal(plan.zhihu, 6)
  assert.equal(plan.web, 6)
  assert.equal(plan.candidates, 12)
  assert.equal(plan.cached, false)
  assert.equal(plan.source, 'pending')

  const topic = byName(first.events, 'topic')[0]
  assert.ok(topic, 'topic event')
  assert.match(topic.topic, /测试问题/)
  assert.equal(topic.source, 'llm')

  assert.equal(calls.answerEffort, 'off')
  assert.equal(calls.answerMaxTokens, 8000)
  assert.equal(calls.curateMaxTokens, 8000)
  const answerText = byName(first.events, 'answer').map((event) => event.t).join('')
  assert.match(answerText, /\[12\]/, 'answer cites a candidate that curation did not pick')

  const firstCards = cards(first.events)
  assert.equal(firstCards.length, 3, 'two curated cards + one backfilled card')
  assert.equal(firstCards[0].candidateId, 1)
  assert.equal(firstCards[1].candidateId, 2)
  const extra = firstCards[2]
  assert.equal(extra.candidateId, 12)
  assert.equal(extra.backfill, true)
  assert.equal(extra.group.label, '其他参考内容')

  const citations = byName(first.events, 'citations')[0]
  assert.ok(citations, 'citations event')
  assert.equal(citations.map[1], 0)
  assert.equal(citations.map[12], 2)
  assert.equal(citations.backfilled, 1)

  const done = byName(first.events, 'done')[0]
  assert.equal(done.cards, 3)
  assert.equal(done.cited, 2)
  assert.equal(done.backfilled, 1)

  const names = first.events.map((event) => event.name)
  assert.ok(names.indexOf('citations') > names.lastIndexOf('card'), 'citations after all cards')
  assert.ok(names.indexOf('done') > names.indexOf('citations'), 'done last')

  // Parallel sanity: the answer stream must not wait for curation's 80ms card drip.
  const firstAnswerAt = first.events.findIndex((event) => event.name === 'answer')
  const lastCardAt = first.events.map((event) => event.name).lastIndexOf('card')
  assert.ok(firstAnswerAt >= 0 && lastCardAt >= 0, 'both streams present')

  // Cache hit: curation is skipped, the answer still runs, backfill still reconciles.
  const curateCalls = calls.curate
  const answerCalls = calls.answer
  const second = await runSse(handler, `/zsearch/api/stream?q=${query}`)
  const secondPlan = byName(second.events, 'plan')[0]
  assert.equal(secondPlan.cached, true)
  assert.equal(calls.curate, curateCalls, 'cache hit skips curation')
  assert.equal(calls.answer, answerCalls + 1, 'cache hit still regenerates the answer')
  const secondCards = cards(second.events)
  assert.equal(secondCards.length, 3)
  assert.equal(secondCards[2].backfill, true)
  assert.equal(byName(second.events, 'citations')[0].map[12], 2)

  // No missing citations: no backfill call, all citations resolve to curated cards.
  const noMissingCalls = { expand: 0, curate: 0, answer: 0, backfill: 0 }
  const noMissing = makeCtx(makeLlm(noMissingCalls, { answerFirstOnly: true }))
  apply(noMissing.ctx, { cliPath: cli, cacheMinutes: 10, debug: false })
  const third = await runSse(noMissing.state.registered.handler, `/zsearch/api/stream?q=${encodeURIComponent('第二次测试')}`)
  assert.equal(noMissingCalls.backfill, 0)
  assert.equal(cards(third.events).length, 2)
  assert.deepEqual(byName(third.events, 'citations')[0].map, { 1: 0 })

  // Unknown citation id: ignored by the reconciler, no crash, no phantom card.
  const unknownCalls = { expand: 0, curate: 0, answer: 0, backfill: 0 }
  const unknown = makeCtx(makeLlm(unknownCalls, { answerExtra: true, answerFirstOnly: true }))
  apply(unknown.ctx, { cliPath: cli, cacheMinutes: 10, debug: false })
  const unknownRun = await runSse(unknown.state.registered.handler, `/zsearch/api/stream?q=${encodeURIComponent('未知引用测试')}`)
  assert.equal(unknownCalls.backfill, 0)
  assert.equal(cards(unknownRun.events).length, 2)
  assert.equal(byName(unknownRun.events, 'citations')[0].map[999], undefined)

  // Empty backfill response: fall back to a local quote so the citation still resolves.
  const brokenCalls = { expand: 0, curate: 0, answer: 0, backfill: 0 }
  const broken = makeCtx(makeLlm(brokenCalls, { backfillFail: true }))
  apply(broken.ctx, { cliPath: cli, cacheMinutes: 10, debug: false })
  const brokenRun = await runSse(broken.state.registered.handler, `/zsearch/api/stream?q=${encodeURIComponent('补卡兜底测试')}`)
  assert.equal(brokenCalls.backfill, 1)
  assert.equal(byName(brokenRun.events, 'citations')[0].backfilled, 1)
  assert.equal(cards(brokenRun.events).length, 3)
  assert.equal(byName(brokenRun.events, 'citations')[0].map[12], 2)
  assert.ok(cards(brokenRun.events)[2].quote.length >= 18)

  // Empty answer from a transient error: retried once, then succeeds without a warning.
  const retryCalls = { expand: 0, curate: 0, answer: 0, backfill: 0 }
  const retried = makeCtx(makeLlm(retryCalls, { emptyOnce: true }))
  apply(retried.ctx, { cliPath: cli, cacheMinutes: 10, debug: false })
  const retriedRun = await runSse(retried.state.registered.handler, `/zsearch/api/stream?q=${encodeURIComponent('空回答重试测试')}`)
  assert.equal(retryCalls.answer, 2, 'empty answer triggers one retry')
  assert.equal(byName(retriedRun.events, 'answer-status').length, 0, 'successful retry clears the warning')
  const retriedDone = byName(retriedRun.events, 'done')[0]
  assert.equal(retriedDone.answer.finish, 'stop')
  assert.equal(retriedDone.attempts, 2)
  const retriedDiag = await runJson(retried.state.registered.handler, '/zsearch/api/diagnostics')
  assert.equal(retriedDiag.items[0].attempts, 2)
  assert.equal(retriedDiag.items[0].attemptsDetail.length, 2)
  assert.equal(retriedDiag.items[0].attemptsDetail[0].finish, 'error')
  assert.equal(retriedDiag.items[0].attemptsDetail[1].finish, 'stop')
  assert.ok(Number.isFinite(retriedDiag.items[0].timings.firstAnswerMs))
  assert.ok(Number.isFinite(retriedDiag.items[0].timings.answerMs))

  // Empty max-tokens answer: retried once with a larger output budget.
  const tokenCalls = { expand: 0, curate: 0, answer: 0, backfill: 0 }
  const tokenRetry = makeCtx(makeLlm(tokenCalls, { emptyOnce: true, emptyFinish: 'max-tokens' }))
  apply(tokenRetry.ctx, { cliPath: cli, cacheMinutes: 10, debug: false })
  const tokenRun = await runSse(tokenRetry.state.registered.handler, `/zsearch/api/stream?q=${encodeURIComponent('长度上限重试测试')}`)
  assert.equal(tokenCalls.answer, 2, 'empty max-tokens answer is retried')
  assert.equal(byName(tokenRun.events, 'answer-status').length, 0)
  assert.equal(byName(tokenRun.events, 'done')[0].answer.finish, 'stop')
  const tokenDiag = await runJson(tokenRetry.state.registered.handler, '/zsearch/api/diagnostics')
  assert.equal(tokenDiag.items[0].attemptsDetail[0].maxTokens, 8000)
  assert.equal(tokenDiag.items[0].attemptsDetail[1].maxTokens, 8000)

  // Abnormal terminal finish: surfaced to the client and kept in diagnostics.
  const finishCalls = { expand: 0, curate: 0, answer: 0, backfill: 0 }
  const finished = makeCtx(makeLlm(finishCalls, {
    answerFinish: 'error',
    answerFinishMessage: 'upstream reset',
  }))
  apply(finished.ctx, { cliPath: cli, cacheMinutes: 10, debug: false })
  const finishedRun = await runSse(finished.state.registered.handler, `/zsearch/api/stream?q=${encodeURIComponent('终止测试')}`)
  const notice = byName(finishedRun.events, 'answer-status')[0]
  assert.ok(notice, 'answer-status event')
  assert.equal(notice.finish, 'error')
  assert.match(notice.message, /upstream reset/)
  const finishedDone = byName(finishedRun.events, 'done')[0]
  assert.equal(finishedDone.answer.finish, 'error')
  assert.match(finishedDone.answer.message, /upstream reset/)
  const diagnostics = await runJson(finished.state.registered.handler, '/zsearch/api/diagnostics')
  assert.equal(diagnostics.ok, true)
  assert.equal(diagnostics.items[0].finish, 'error')
  assert.ok(diagnostics.items[0].answerChars > 0)

  // Parallel proof: a slow curation must not delay the first answer token.
  const delayCalls = { expand: 0, curate: 0, answer: 0, backfill: 0 }
  const delayed = makeCtx(makeLlm(delayCalls, { curateDelayMs: 150 }))
  apply(delayed.ctx, { cliPath: cli, cacheMinutes: 10, debug: false })
  const parallel = await runSse(delayed.state.registered.handler, `/zsearch/api/stream?q=${encodeURIComponent('并行测试')}`)
  const parallelNames = parallel.events.map((event) => event.name)
  const answerAt = parallelNames.indexOf('answer')
  const cardAt = parallelNames.indexOf('card')
  assert.ok(answerAt >= 0, 'answer streamed')
  assert.ok(cardAt >= 0, 'cards streamed')
  assert.ok(answerAt < cardAt, 'answer starts before a slow curation finishes')

  // Missing model service: retrieval still works, heuristic cards and fallback copy remain.
  let noLlmHandler = null
  const noLlmCtx = {
    get() { return undefined },
    effect(fn) { fn() },
    webServer: { register(options) { noLlmHandler = options.handler; return () => {} } },
  }
  apply(noLlmCtx, { cliPath: cli, cacheMinutes: 10, debug: false })
  const noLlm = await runSse(noLlmHandler, `/zsearch/api/stream?q=${encodeURIComponent('无模型测试')}`)
  assert.ok(cards(noLlm.events).length >= 8, 'heuristic cards without a model')
  assert.match(byName(noLlm.events, 'answer').map((event) => event.t).join(''), /没有拿到模型输出/)
  assert.equal(byName(noLlm.events, 'citations')[0].backfilled, 0)

  // Curation failure: heuristic fallback, answer still streams, no crash.
  const failCalls = { expand: 0, curate: 0, answer: 0, backfill: 0 }
  const failing = makeCtx(makeLlm(failCalls, { curateFail: true }))
  apply(failing.ctx, { cliPath: cli, cacheMinutes: 10, debug: false })
  const fourth = await runSse(failing.state.registered.handler, `/zsearch/api/stream?q=${encodeURIComponent('第三次测试')}`)
  assert.ok(cards(fourth.events).length >= 8, 'heuristic cards survive curation failure')
  assert.ok(byName(fourth.events, 'done').length === 1)
  assert.ok(byName(fourth.events, 'answer').length > 0)

  // Plugin topic: catalog, install inspection, install, and the plugin search mode.
  const pluginCatalog = await runJson(handler, '/zsearch/api/plugins/list')
  assert.equal(pluginCatalog.count, 60)
  assert.equal(pluginCatalog.items.length, 60)
  assert.ok(pluginCatalog.items[0].stars >= pluginCatalog.items[1].stars, 'catalog is sorted by stars')
  const targetPlugin = pluginCatalog.items[0]
  const inspected = await runJson(handler, `/zsearch/api/plugins/install/inspect?pluginId=${encodeURIComponent(targetPlugin.id)}`)
  assert.equal(inspected.ok, true)
  assert.equal(inspected.result.name, targetPlugin.npm)
  const installed = await runPost(handler, '/zsearch/api/plugins/install', { pluginId: targetPlugin.id })
  assert.equal(installed.ok, true)
  assert.equal(installs.length, 1)
  assert.equal(installs[0].spec, targetPlugin.npm)
  const beforeGuard = installs.length
  const blocked = await runPost(handler, '/zsearch/api/plugins/install', { pluginId: targetPlugin.id }, {
    'sec-fetch-site': 'cross-site',
    origin: 'https://evil.example',
  })
  assert.equal(blocked.error, 'origin_not_allowed', 'cross-site install is rejected')
  assert.equal(installs.length, beforeGuard, 'cross-site install does not reach the manager')

  const pluginCalls = { expand: 0, curate: 0, answer: 0, backfill: 0 }
  const pluginCtx = makeCtx(makeLlm(pluginCalls), manager)
  apply(pluginCtx.ctx, { cliPath: cli, cacheMinutes: 10, debug: false })
  const pluginRun = await runSse(pluginCtx.state.registered.handler, `/zsearch/api/stream?mode=plugin&pluginId=${encodeURIComponent(targetPlugin.id)}`)
  assert.equal(pluginRun.status, 200)
  const pluginQuery = byName(pluginRun.events, 'query')[0].query
  assert.match(pluginQuery, /如何评价 DSH 插件「/)
  assert.match(pluginQuery, new RegExp(targetPlugin.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.ok(byName(pluginRun.events, 'plan')[0], 'plugin plan event')
  assert.ok(pluginCalls.curate > 0, 'plugin curation prompt ran')
  assert.ok(pluginCalls.answer > 0, 'plugin answer prompt ran')
  assert.equal(byName(pluginRun.events, 'topic')[0].topic, '这个插件值不值得装？')
  const pluginCards = cards(pluginRun.events)
  assert.equal(pluginCards[0].group.label, '真实体验')
  assert.equal(pluginCards[1].group.label, '局限与风险')

  // Reasoning effort fallback: keep 'off' when supported, fall back to lowest supported effort otherwise, and omit for non-reasoning models.
  const offSupportedCalls = { expand: 0, curate: 0, answer: 0, backfill: 0 }
  const offSupported = makeCtx(makeLlm(offSupportedCalls, {
    modelInfo: { reasoning: { efforts: [{ id: 'off', name: 'Off' }, { id: 'low', name: 'Low' }] } },
  }))
  apply(offSupported.ctx, { cliPath: cli, cacheMinutes: 10, debug: false })
  const offSupportedRun = await runSse(offSupported.state.registered.handler, `/zsearch/api/stream?q=${encodeURIComponent('支持关闭推理测试')}`)
  assert.equal(byName(offSupportedRun.events, 'done')[0].answer.finish, 'stop')
  assert.ok(offSupportedCalls.efforts.length >= 3 && offSupportedCalls.efforts.every((effort) => effort === 'off'))

  const noOffCalls = { expand: 0, curate: 0, answer: 0, backfill: 0 }
  const noOff = makeCtx(makeLlm(noOffCalls, {
    modelInfo: { reasoning: { efforts: [{ id: 'low', name: 'Low' }, { id: 'medium', name: 'Medium' }, { id: 'high', name: 'High' }] } },
    rejectEfforts: ['off'],
  }))
  apply(noOff.ctx, { cliPath: cli, cacheMinutes: 10, debug: false })
  const noOffRun = await runSse(noOff.state.registered.handler, `/zsearch/api/stream?q=${encodeURIComponent('不支持off回退low测试')}`)
  assert.equal(byName(noOffRun.events, 'answer-status').length, 0)
  assert.equal(byName(noOffRun.events, 'done')[0].answer.finish, 'stop')
  assert.ok(noOffCalls.efforts.length >= 3 && noOffCalls.efforts.every((effort) => effort === 'low'))

  const nonReasoningCalls = { expand: 0, curate: 0, answer: 0, backfill: 0 }
  const nonReasoning = makeCtx(makeLlm(nonReasoningCalls, {
    modelInfo: {},
    rejectAnyEffort: true,
  }))
  apply(nonReasoning.ctx, { cliPath: cli, cacheMinutes: 10, debug: false })
  const nonReasoningRun = await runSse(nonReasoning.state.registered.handler, `/zsearch/api/stream?q=${encodeURIComponent('非推理模型省略effort测试')}`)
  assert.equal(byName(nonReasoningRun.events, 'answer-status').length, 0)
  assert.equal(byName(nonReasoningRun.events, 'done')[0].answer.finish, 'stop')
  assert.ok(nonReasoningCalls.efforts.length >= 3 && nonReasoningCalls.efforts.every((effort) => effort === undefined))

  const infoErrorCalls = { expand: 0, curate: 0, answer: 0, backfill: 0 }
  const infoError = makeCtx(makeLlm(infoErrorCalls, {
    modelInfo: new Error('metadata lookup failed'),
    rejectAnyEffort: true,
  }))
  apply(infoError.ctx, { cliPath: cli, cacheMinutes: 10, debug: false })
  const infoErrorRun = await runSse(infoError.state.registered.handler, `/zsearch/api/stream?q=${encodeURIComponent('元数据失败回退省略测试')}`)
  assert.equal(byName(infoErrorRun.events, 'answer-status').length, 0)
  assert.equal(byName(infoErrorRun.events, 'done')[0].answer.finish, 'stop')
  assert.ok(infoErrorCalls.efforts.length >= 3 && infoErrorCalls.efforts.every((effort) => effort === undefined))

  console.log('server integration ok')
  console.log(`  calls: expand=${calls.expand} curate=${calls.curate} answer=${calls.answer} backfill=${calls.backfill}`)
  console.log(`  first run: cards=${firstCards.length} cited=${done.cited} backfilled=${done.backfilled}`)
  console.log(`  cache hit: curate=${calls.curate - curateCalls} answer=${calls.answer - answerCalls}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

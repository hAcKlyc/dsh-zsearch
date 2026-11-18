import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// ---- minimal React hook runtime -------------------------------------------
const slots = []
let cursor = 0
let rendering = false
let dirty = false
let component = null
let props = null
let lastTree = null

const sameDeps = (a, b) => Array.isArray(a) && Array.isArray(b)
  && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))

function runEffects() {
  for (const slot of slots) {
    if (!slot?.effect) continue
    const run = slot.effect
    slot.effect = null
    if (slot.cleanup) slot.cleanup()
    const cleanup = run()
    slot.cleanup = typeof cleanup === 'function' ? cleanup : null
  }
}

function schedule() {
  if (rendering) { dirty = true; return }
  do {
    dirty = false
    cursor = 0
    rendering = true
    lastTree = component(props)
    rendering = false
    rendering = true
    runEffects()
    rendering = false
  } while (dirty)
}

const React = {
  createElement: (type, propsArg, ...children) => ({ type, props: { ...(propsArg ?? {}), children }, children }),
  Fragment: 'Fragment',
  useState(initial) {
    const index = cursor++
    const slot = slots[index] || (slots[index] = {})
    if (!('value' in slot)) slot.value = typeof initial === 'function' ? initial() : initial
    const set = (next) => {
      const value = typeof next === 'function' ? next(slot.value) : next
      if (Object.is(value, slot.value)) return
      slot.value = value
      schedule()
    }
    return [slot.value, set]
  },
  useEffect(fn, deps) {
    const index = cursor++
    const slot = slots[index] || (slots[index] = {})
    if (!slot.initialized || !deps || !sameDeps(slot.deps, deps)) {
      slot.initialized = true
      slot.deps = deps
      slot.effect = fn
    }
  },
  useRef(value) {
    const index = cursor++
    const slot = slots[index] || (slots[index] = {})
    if (!('ref' in slot)) slot.ref = { current: value ?? null }
    return slot.ref
  },
  useMemo(fn, deps) {
    const index = cursor++
    const slot = slots[index] || (slots[index] = {})
    if (!slot.initialized || !sameDeps(slot.deps, deps)) {
      slot.initialized = true
      slot.deps = deps
      slot.value = fn()
    }
    return slot.value
  },
}

// ---- sandbox --------------------------------------------------------------
let moduleValue = null
class FakeEventSource {
  static instances = []
  constructor(url) {
    this.url = url
    this.listeners = {}
    this.closed = false
    FakeEventSource.instances.push(this)
  }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn) }
  close() { this.closed = true }
  emit(name, data) {
    for (const fn of this.listeners[name] ?? []) fn({ data: JSON.stringify(data) })
  }
}

const window = {
  __ModuleLoader__: { load(value) { moduleValue = value } },
  localStorage: { getItem() { return null }, setItem() {} },
  addEventListener() {},
  removeEventListener() {},
  open() {},
}

const sandbox = {
  window,
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  EventSource: FakeEventSource,
  navigator: { clipboard: { writeText() {} } },
  document: { addEventListener() {}, removeEventListener() {} },
  fetch: async () => ({ json: async () => ({}) }),
  Element: class Element {},
}
sandbox.globalThis = sandbox

// Test-only export of the components/helpers under test.
const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  .replace(
    "    return {\n      inject: ['slots'],",
    "    return {\n      __test: { renderInline, renderAnswer, elementChildren, renumberCitations, Results, Home, App, SettingsPanel, Setup, PluginsPage, PluginCard },\n      inject: ['slots'],",
  )
assert.match(source, /__test: \{ renderInline, renderAnswer, elementChildren, renumberCitations, Results, Home, App, SettingsPanel, Setup, PluginsPage, PluginCard \}/, 'test export injected')

vm.createContext(sandbox)
vm.runInNewContext(source, sandbox, { filename: 'client.js' })
const api = moduleValue.factory((name) => {
  if (name === 'react') return React
  throw new Error(`unexpected require: ${name}`)
})

component = api.__test.Results
props = { query: '测试问题', runId: 1, onSearch() {}, onHome() {}, setup: null, ready: true, onOpenSetup() {} }
schedule()

const stream = FakeEventSource.instances.at(-1)
assert.ok(stream, 'SSE connection opened')
assert.equal(stream.url, '/zsearch/api/stream?q=' + encodeURIComponent('测试问题'))

const seen = []
const walk = (node) => {
  if (node === null || node === undefined || node === false) return
  if (Array.isArray(node)) { node.forEach(walk); return }
  if (typeof node === 'string' || typeof node === 'number') { seen.push(String(node)); return }
  if (node.props?.className) seen.push(`.${node.props.className}`)
  walk(node.children)
}
const scan = () => { seen.length = 0; walk(lastTree); return seen }

stream.emit('plan', { variants: [], zhihu: 6, web: 6, candidates: 12, source: 'pending', topic: '' })
stream.emit('answer', { t: '先给结论[1]，再补充[12]。' })
assert.ok(scan().includes('.zs-cite pending'), 'unresolved citation starts pending')

stream.emit('card', {
  candidateId: 1, url: 'https://a', title: '一', author: '甲', source: 'zhihu',
  quote: '这是第一条证据。', group: { label: '安装', question: '怎么装？' },
})
assert.ok(scan().includes('.zs-cite'), 'citation resolves once its card arrives')

stream.emit('card', {
  candidateId: 12, url: 'https://b', title: '二', host: 'example.com', source: 'web',
  quote: '这是补充证据。', backfill: true, group: { label: '其他参考内容', question: '' },
})
stream.emit('answer-status', { finish: 'error', message: 'upstream reset' })
stream.emit('citations', { map: { 1: 0, 12: 1 }, backfilled: 1 })
stream.emit('done', { cards: 2, cited: 2, backfilled: 1, answer: { finish: 'error', message: 'upstream reset' } })

const after = scan()
assert.ok(after.includes('其他参考内容'), 'backfill group header renders its label')
assert.ok(after.some((text) => text.includes('补充 1')), 'stats expose the backfill count')
assert.ok(!after.includes('.zs-cite pending'), 'no citation is left pending')
assert.ok(after.includes('.zs-cite'), 'both citations resolve')
assert.ok(!after.includes('.zs-minimark'), 'results topbar has no ZSearch minimark')
assert.ok(!after.includes('.zs-eyebrow'), 'results has no question eyebrow')
assert.ok(!after.includes('.zs-anshead'), 'results has no answer header')
assert.ok(after.some((text) => text.includes('回答生成中断')), 'abnormal finish shows a warning')
assert.ok(after.some((text) => text.includes('upstream reset')), 'warning includes the terminal failure message')

const { renderInline, renumberCitations } = api.__test
const cards = [{ url: 'https://a', candidateId: 1, title: '一', author: '甲', source: 'zhihu' }]
let cited = -1
const cite = renderInline('结论[1]。', 'p', cards, { map: { 1: 0 }, final: true }, (index) => { cited = index })
  .find((node) => node?.props?.className === 'zs-cite')
assert.equal(cite.children[0], '1')
cite.props.onClick()
assert.equal(cited, 0)
assert.equal(renumberCitations('甲[1]乙[999]', { 1: 0 }), '甲[1]乙[999]')

// Home: no logo row, no footer, no source pills; composer stays single-row.
const { Home } = api.__test
slots.length = 0
component = Home
props = { onSearch() {}, setup: null, ready: true, onOpenSetup() {} }
schedule()
const home = scan()
assert.ok(home.includes('问知乎，查全网'), 'home slogan renders')
assert.ok(home.some((text) => text.includes('.zs-composer')), 'composer renders')
assert.ok(home.some((text) => text.includes('.zs-submit')), 'submit renders')
assert.ok(!home.includes('.zs-brandrow'), 'home has no logo row')
assert.ok(!home.includes('.zs-foot'), 'home has no footer')
assert.ok(!home.includes('.zs-srcpill'), 'home has no source pills')
assert.ok(!home.includes('.zs-tools'), 'home has no tools row')
assert.ok(home.some((text) => text.includes('.zs-topic-entry')), 'home exposes the plugin topic')

// Plugin topic list and detail card render with the catalog shape.
const { PluginsPage, PluginCard } = api.__test
slots.length = 0
component = PluginsPage
props = {
  items: [
    { id: 'a', name: 'alpha', category: '工具', desc: '第一个插件', stars: 1200, downloads: 3400 },
    { id: 'b', name: 'beta', category: '主题', desc: '第二个插件', stars: 300, downloads: 200 },
  ],
  loading: false, error: null, updatedAt: '2026-11-04',
  onBack() {}, onOpen() {}, onRetry() {},
}
schedule()
const pluginsPage = scan()
assert.ok(pluginsPage.some((text) => text.includes('.zs-plugin-grid')), 'plugin grid renders')
assert.ok(pluginsPage.includes('alpha'), 'plugin name renders')
assert.ok(pluginsPage.includes('热门插件'), 'plugin topic title renders')

slots.length = 0
component = PluginCard
props = {
  plugin: { id: 'a', name: 'alpha', category: '工具', desc: '第一个插件', stars: 1200, downloads: 3400, npm: 'alpha', install: 'dsh plugin add alpha' },
}
schedule()
const pluginCard = scan()
assert.ok(pluginCard.some((text) => text.includes('.zs-plugin-card')), 'plugin detail card renders')
assert.ok(pluginCard.includes('alpha'), 'plugin detail name renders')
assert.ok(pluginCard.some((text) => text.includes('安装到当前 Profile')), 'plugin install action renders')
// Plugin detail reuses Results but opens the plugin-mode stream and renders the card.
slots.length = 0
component = api.__test.Results
props = {
  query: '如何评价 DSH 插件「alpha」？', runId: 7, pluginId: 'a', persist: false,
  plugin: { id: 'a', name: 'alpha', category: '工具', desc: '第一个插件', stars: 1200, downloads: 3400, npm: 'alpha', install: 'dsh plugin add alpha' },
  onSearch() {}, onHome() {}, onBack() {}, setup: null, ready: true, onOpenSetup() {},
}
schedule()
const pluginStream = FakeEventSource.instances.at(-1)
assert.ok(pluginStream.url.includes('mode=plugin'), 'plugin detail uses plugin mode')
assert.ok(pluginStream.url.includes('pluginId=a'), 'plugin detail sends plugin id')
const detail = scan()
assert.ok(detail.some((text) => text.includes('.zs-body')), 'plugin detail reuses the results body')

// Full Markdown: fenced code, table, nested list, task list, image, raw HTML escaping.
const { renderAnswer, elementChildren } = api.__test
assert.deepEqual(elementChildren({ props: { children: ['x'] } }), ['x'], 'real React children live under props')
const markdown = [
  '# 一级标题',
  '',
  '## 二级标题',
  '',
  '普通段落，包含 **加粗**、*斜体*、~~删除~~、`行内代码`、[链接](https://example.com) 和引用 [2]。',
  '',
  '> 引用段落',
  '> - 引用内列表',
  '',
  '```js',
  'const x = 1',
  '// **不解析**',
  '```',
  '',
  '| 左 | 右 |',
  '|:---|---:|',
  '| a | 1 |',
  '',
  '- 父项',
  '  - 子项',
  '- [x] 已完成',
  '- [ ] 未完成',
  '',
  '![图片](https://example.com/a.png)',
  '',
  '<https://example.com>',
  '',
  '<script>alert(1)</script>',
].join('\n')

const mdNodes = renderAnswer(markdown, cards, { map: { 2: 0 }, final: true }, () => {})
const mdElements = []
const collect = (node) => {
  if (Array.isArray(node)) { node.forEach(collect); return }
  if (!node || typeof node !== 'object') return
  mdElements.push(node)
  collect(node.children)
}
collect(mdNodes)
const byType = (type) => mdElements.filter((node) => node.type === type)
assert.ok(byType('h1').length === 1 && byType('h2').length === 1, 'headings render')
assert.ok(byType('del').length === 1, 'strikethrough renders')
assert.ok(byType('table').length === 1, 'table renders')
assert.ok(byType('blockquote').length === 1, 'blockquote renders')
assert.ok(byType('hr').length === 0, 'no stray hr')
assert.ok(byType('img').some((node) => node.props.src === 'https://example.com/a.png'), 'image renders')
assert.ok(!byType('script').length, 'raw html is not injected')
assert.ok(byType('input').some((node) => node.props.type === 'checkbox'), 'task list renders')
const hasDescendantType = (node, type) => {
  if (Array.isArray(node)) return node.some((child) => hasDescendantType(child, type))
  if (!node || typeof node !== 'object') return false
  if (node.type === type) return true
  return hasDescendantType(node.children, type)
}
assert.ok(mdElements.some((node) => node.type === 'li' && hasDescendantType(node.children, 'ul')), 'nested list renders')
const pre = byType('pre')[0]
assert.ok(pre && pre.children[0]?.type === 'code', 'fenced code renders as pre/code')
assert.match(pre.children[0].children[0], /\*\*不解析\*\*/)
const link = mdElements.find((node) => node.type === 'a' && node.props.href === 'https://example.com')
assert.ok(link, 'link renders')
const mdCite = mdElements.find((node) => node.type === 'sup' && node.props.className === 'zs-cite')
assert.ok(mdCite && mdCite.children[0] === '1', 'citation inside markdown resolves')

const setext = renderAnswer('Setext 标题\n---', cards, { map: {}, final: true }, () => {})
assert.ok(setext.some((node) => node.type === 'h2'), 'setext heading renders')
const rule = renderAnswer('上面\n\n***\n\n下面', cards, { map: {}, final: true }, () => {})
assert.ok(rule.some((node) => node.type === 'hr'), 'thematic break renders')
const boldList = renderAnswer('- **委托人不是监护人**：孩子法定监护人是母亲黄某某，仍受理了鉴定[2]。', cards, { map: { 2: 0 }, final: true }, () => {})
const boldListText = []
const collectText = (node) => {
  if (Array.isArray(node)) { node.forEach(collectText); return }
  if (typeof node === 'string') { boldListText.push(node); return }
  if (!node || typeof node !== 'object') return
  collectText(node.children)
}
collectText(boldList)
assert.ok(boldListText.join('').includes('孩子法定监护人是母亲黄某某'), 'bold list item keeps its body text')
const partialCode = renderAnswer('```js\nconst x = 1', cards, { map: {}, final: true }, () => {})
assert.ok(partialCode.some((node) => node.type === 'div' && node.props.className === 'zs-codeblock'), 'unclosed fence renders while streaming')
const unsafe = renderAnswer('[点我](javascript:alert(1))', cards, { map: {}, final: true }, () => {})
const unsafeLinks = []
const collectLinks = (node) => {
  if (Array.isArray(node)) { node.forEach(collectLinks); return }
  if (!node || typeof node !== 'object') return
  if (node.type === 'a') unsafeLinks.push(node.props.href)
  collectLinks(node.children)
}
collectLinks(unsafe)
assert.ok(!unsafeLinks.some((href) => /^javascript:/i.test(String(href))), 'unsafe link protocols are rejected')

// Settings entry opens the panel without disturbing the main view.
const { App, SettingsPanel, Setup } = api.__test
slots.length = 0
component = App
props = {}
schedule()
const findNode = (node, predicate) => {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findNode(child, predicate)
      if (found) return found
    }
    return null
  }
  if (!node || typeof node !== 'object') return null
  if (predicate(node)) return node
  return findNode(node.children ?? node.props?.children, predicate)
}
const gear = findNode(lastTree, (node) => node.props?.className === 'zs-set-btn')
assert.ok(gear, 'settings button renders')
gear.props.onClick()
schedule()
assert.ok(findNode(lastTree, (node) => node.type === SettingsPanel), 'settings panel opens')
slots.length = 0
component = SettingsPanel
props = {
  value: { theme: 'system', fontSize: 'md', density: 'comfortable', motion: true, selection: true, forceRefresh: false, showStats: true, showDebug: true },
  onChange() {}, onClose() {}, setup: null, onRefreshSetup() {}, onOpenSetup() {}, onClearPanel() {}, onResetSettings() {},
}
schedule()
assert.ok(scan().some((cls) => cls.startsWith('.zs-settings')), 'settings panel renders')
assert.ok(scan().some((text) => text.includes('外观')), 'settings sections render')
assert.ok(scan().some((text) => text.includes('回答字号')), 'all appearance rows render')
assert.ok(scan().some((text) => text.includes('显示 DEBUG 按钮')), 'debug toggle renders')
assert.ok(scan().some((text) => text.includes('用户交流群')), 'community QR section renders')
const qrImage = findNode(lastTree, (node) => node.type === 'img' && node.props?.src === 'https://raw.githubusercontent.com/hAcKlyc/dsh-zsearch/main/docs/wechat-group.jpg')
assert.ok(qrImage, 'community QR uses the remote GitHub image')
qrImage.props.onError()
schedule()
assert.ok(!scan().some((text) => text.includes('用户交流群')), 'failed remote QR hides the whole section')

slots.length = 0
component = Setup
props = { status: { cli: { found: true, version: '0.6.3' }, auth: { configured: true, masked: '1234...cdef' } }, onDone() {}, onRefresh() {} }
schedule()
assert.ok(scan().includes('.zs-onb-card'), 'onboarding card renders')
assert.ok(scan().some((text) => text.includes('都接上了')), 'ready onboarding title renders')
assert.ok(scan().some((text) => text.includes('开始搜索')), 'start action renders')
slots.length = 0
props = { status: { cli: { found: true, version: '0.6.3' }, auth: { configured: false } }, onDone() {}, onRefresh() {} }
schedule()
assert.ok(scan().includes('.zs-onb-form'), 'secret form renders when missing')
assert.ok(scan().some((text) => text.includes('把知乎检索接上')), 'incomplete onboarding title renders')

console.log('client render ok')

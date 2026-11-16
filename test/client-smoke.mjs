import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  Fragment: 'Fragment',
  useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
  useEffect: () => {},
  useRef: (value) => ({ current: value ?? null }),
  useMemo: (fn) => fn(),
}

let moduleValue = null
const window = {
  __ModuleLoader__: {
    load(value) { moduleValue = value },
  },
  localStorage: {
    getItem() { return null },
    setItem() {},
  },
  addEventListener() {},
  removeEventListener() {},
}

const sandbox = {
  window,
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  cancelAnimationFrame: clearTimeout,
  document: {
    getSelection() { return null },
    addEventListener() {},
    removeEventListener() {},
  },
  navigator: { clipboard: { writeText() {} } },
  fetch: async () => ({ json: async () => ({}) }),
  Element: class Element {},
}
sandbox.globalThis = sandbox

// Expose the pure render helpers for assertions (test-only transform).
const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  .replace("    return {\n      inject: ['slots'],", "    return {\n      __test: { renderInline, renumberCitations },\n      inject: ['slots'],")
assert.notEqual(source, readFileSync(new URL('../client.js', import.meta.url), 'utf8'), 'test exports injected')

vm.createContext(sandbox)
vm.runInNewContext(source, sandbox, { filename: 'client.js' })

assert.ok(moduleValue, 'client module registered')
assert.equal(moduleValue.id, 'dsh-zsearch')

const registered = []
const slots = {
  inject(name, fn) { fn(name) },
  register(spec) { registered.push(spec.name ?? spec.key); return () => {} },
}
const api = moduleValue.factory((name) => {
  if (name === 'react') return React
  throw new Error(`unexpected require: ${name}`)
})
api.apply({ slots, get() { return undefined } })

assert.ok(registered.includes('main'), 'main slot registered')
assert.ok(registered.includes('sidebar.panellist'), 'sidebar slot registered')
assert.ok(registered.includes('shell.overlay'), 'selection overlay registers without the layout service')

const { renderInline, renumberCitations } = api.__test
const cards = [
  { url: 'https://a', candidateId: 1, title: '标题一', author: '答主', source: 'zhihu' },
  { url: 'https://b', candidateId: 2, title: '标题二', author: '答主', source: 'zhihu' },
  { url: 'https://c', candidateId: 12, title: '补充', host: 'example.com', source: 'web' },
]
const findCite = (nodes) => nodes.find((node) => node?.props?.className?.startsWith('zs-cite'))

const resolved = renderInline('结论在这里[7]。', 'p', cards, { map: { 7: 2 }, final: true }, null)
const cite = findCite(resolved)
assert.equal(cite.props.className, 'zs-cite')
assert.equal(cite.children[0], '3')
assert.match(cite.props.title, /补充/)

const pending = findCite(renderInline('等待[7]。', 'p', cards, { map: {}, final: false }, null))
assert.equal(pending.props.className, 'zs-cite pending')
assert.equal(pending.children[0], '·')

const missing = findCite(renderInline('缺失[9]。', 'p', cards, { map: {}, final: true }, null))
assert.equal(missing.props.className, 'zs-cite missing')
assert.equal(missing.children[0], '9')

assert.equal(renumberCitations('甲[1]乙[7]丙[9]', { 1: 0, 7: 2 }), '甲[1]乙[3]丙[9]')
console.log('client smoke ok:', registered.join(', '))

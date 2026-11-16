window.__ModuleLoader__.load({
  id: 'dsh-zsearch',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useRef, useMemo } = React

    const BLUE = '#056DE8'

    const ICONS = {
      search: [['circle', { cx: 11, cy: 11, r: 7 }], ['path', { d: 'M16.5 16.5 21 21' }]],
      arrowUp: [['path', { d: 'M12 19V5' }], ['path', { d: 'm5 12 7-7 7 7' }]],
      back: [['path', { d: 'M15 18 9 12l6-6' }]],
      out: [['path', { d: 'M7 17 17 7' }], ['path', { d: 'M8 7h9v9' }]],
      copy: [['rect', { x: 9, y: 9, width: 11, height: 11, rx: 2.5 }], ['path', { d: 'M5 15V6a2 2 0 0 1 2-2h8' }]],
      check: [['path', { d: 'm5 12.5 4.5 4.5L19 7.5' }]],
      redo: [['path', { d: 'M20 11a8 8 0 1 0-2.3 5.7' }], ['path', { d: 'M20 4v7h-7' }]],
      spark: [['path', { d: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6' }]],
      globe: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18' }]],
      up: [['path', { d: 'M12 5 5 13h4.5v6h5v-6H19z' }]],
      chat: [['path', { d: 'M20 12a8 8 0 0 1-11.6 7.1L4 20l.9-4.4A8 8 0 1 1 20 12z' }]],
      info: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 11v5M12 8h.01' }]],
      quote: [['path', { d: 'M7 7h4v4c0 3-1.5 5-4 6M14 7h4v4c0 3-1.5 5-4 6' }]],
      settings: [['path', { d: 'M4 6h8M16 6h4M4 12h2M10 12h10M4 18h8M16 18h4' }], ['circle', { cx: 14, cy: 6, r: 2 }], ['circle', { cx: 8, cy: 12, r: 2 }], ['circle', { cx: 14, cy: 18, r: 2 }]],
    }

    function Icon({ name, size = 16, stroke = 1.8, fill }) {
      return h('svg', {
        className: 'zs-ico', width: size, height: size, viewBox: '0 0 24 24', fill: fill ?? 'none',
        stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
      }, (ICONS[name] ?? []).map(([tag, props], i) => h(tag, { key: i, ...props })))
    }

    function fmtCount(n) {
      const v = Number(n) || 0
      if (v >= 10000) return `${(v / 10000).toFixed(v >= 100000 ? 0 : 1)} 万`
      return String(v)
    }

    function answerNotice(status) {
      if (!status || !status.finish || status.finish === 'stop') return ''
      const message = String(status.message ?? '').trim().slice(0, 160)
      const detail = message ? `：${message}` : ''
      if (status.finish === 'max-tokens') {
        return '回答达到长度上限，已保留已生成的部分。可以重新生成，或把问题问得更具体。'
      }
      if (status.finish === 'aborted') return `回答生成被中断${detail}。已保留已生成的部分。`
      if (status.finish === 'error') return `回答生成中断${detail}。已保留已生成的部分。`
      return '回答可能未完整生成，已保留已生成的部分。'
    }

    // The answer cites candidate ids; copies should show the numbers users see.
    function renumberCitations(text, map) {
      return String(text ?? '').replace(/\[(\d{1,3})\]/g, (token, digits) => {
        const index = map?.[Number(digits)]
        return Number.isInteger(index) ? `[${index + 1}]` : token
      })
    }

    const SELECTION_MAX = 200
    let pendingSearch = null
    let searchSeq = 0
    const searchWaiters = new Set()

    function normalizeSelection(text) {
      const flat = String(text ?? '')
        .replace(/\s*\[\d{1,3}\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (flat.length < 2) return ''
      if (flat.length <= SELECTION_MAX) return flat
      const cut = flat.slice(0, SELECTION_MAX)
      const end = Math.max(
        cut.lastIndexOf('。'),
        cut.lastIndexOf('！'),
        cut.lastIndexOf('？'),
        cut.lastIndexOf('；'),
        cut.lastIndexOf('. '),
      )
      return (end >= 40 ? cut.slice(0, end + 1) : cut).trim()
    }

    function requestSearch(text) {
      const value = normalizeSelection(text)
      if (!value) return false
      const pending = { text: value, seq: ++searchSeq }
      if (searchWaiters.size) {
        for (const waiter of searchWaiters) {
          try { waiter(pending) } catch (error) { console.error(error) }
        }
        return true
      }
      pendingSearch = pending
      return true
    }

    function takePendingSearch() {
      const value = pendingSearch
      pendingSearch = null
      return value
    }

    const PANEL_KEY = 'dsh-zsearch:panel.v1'
    const PANEL_VERSION = 2
    const SETTINGS_KEY = 'dsh-zsearch:settings.v1'
    const DEFAULT_SETTINGS = {
      version: 1,
      theme: 'system',
      fontSize: 'md',
      density: 'comfortable',
      motion: true,
      selection: true,
      forceRefresh: false,
      showStats: true,
      showDebug: true,
    }

    function readSettings() {
      try {
        const raw = window.localStorage.getItem(SETTINGS_KEY)
        if (!raw) return { ...DEFAULT_SETTINGS }
        const value = JSON.parse(raw)
        if (!value || value.version !== 1) return { ...DEFAULT_SETTINGS }
        return {
          ...DEFAULT_SETTINGS,
          theme: ['system', 'light', 'dark'].includes(value.theme) ? value.theme : DEFAULT_SETTINGS.theme,
          fontSize: ['sm', 'md', 'lg'].includes(value.fontSize) ? value.fontSize : DEFAULT_SETTINGS.fontSize,
          density: ['comfortable', 'compact'].includes(value.density) ? value.density : DEFAULT_SETTINGS.density,
          motion: typeof value.motion === 'boolean' ? value.motion : DEFAULT_SETTINGS.motion,
          selection: typeof value.selection === 'boolean' ? value.selection : DEFAULT_SETTINGS.selection,
          forceRefresh: typeof value.forceRefresh === 'boolean' ? value.forceRefresh : DEFAULT_SETTINGS.forceRefresh,
          showStats: typeof value.showStats === 'boolean' ? value.showStats : DEFAULT_SETTINGS.showStats,
          showDebug: typeof value.showDebug === 'boolean' ? value.showDebug : DEFAULT_SETTINGS.showDebug,
        }
      } catch {
        return { ...DEFAULT_SETTINGS }
      }
    }

    let settings = readSettings()

    function writeSettings(patch) {
      settings = { ...settings, ...patch, version: 1 }
      try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
      } catch {
        // Keep the in-memory copy when storage is unavailable.
      }
      return settings
    }

    function readPanelState() {
      try {
        const raw = window.localStorage.getItem(PANEL_KEY)
        if (!raw) return null
        const value = JSON.parse(raw)
        if (!value || value.version !== PANEL_VERSION) return null
        if (value.view !== 'home' && value.view !== 'results') return null
        if (typeof value.query !== 'string') return null
        if (value.attempt !== undefined && !Number.isFinite(value.attempt)) return null
        return value
      } catch {
        return null
      }
    }

    let panelState = readPanelState()

    function updatePanel(patch) {
      panelState = {
        ...(panelState ?? {}),
        version: PANEL_VERSION,
        savedAt: Date.now(),
        ...patch,
      }
      try {
        window.localStorage.setItem(PANEL_KEY, JSON.stringify(panelState))
      } catch {
        // Keep the in-memory copy when storage is unavailable.
      }
    }

    function panelHasContent(saved) {
      return Boolean(saved && (
        (Array.isArray(saved.cards) && saved.cards.length > 0) ||
        (typeof saved.answer === 'string' && saved.answer.length > 0) ||
        saved.plan ||
        (typeof saved.error === 'string' && saved.error.length > 0)
      ))
    }

    function beginSearch(query) {
      const value = String(query ?? '').trim()
      if (!value) return panelState?.attempt ?? 0
      const attempt = (panelState?.attempt ?? 0) + 1
      updatePanel({
        view: 'results',
        query: value,
        attempt,
        started: false,
        phase: 'running',
        cards: [],
        answer: '',
        plan: null,
        error: null,
        interrupted: false,
      })
      return attempt
    }

    function savePanelResults(state) {
      if (!state) return
      if (!panelState || panelState.view !== 'results') return
      if ((panelState.attempt ?? 0) !== state.attempt) return
      if (panelState.query !== state.query) return
      updatePanel({
        started: true,
        phase: state.running ? 'running' : state.error ? 'error' : 'done',
        cards: Array.isArray(state.cards) ? state.cards : [],
        answer: typeof state.answer === 'string' ? state.answer : '',
        plan: state.plan ?? null,
        error: typeof state.error === 'string' ? state.error : null,
        interrupted: state.interrupted === true || state.running === true,
        citationMap: state.citationMap && typeof state.citationMap === 'object' ? state.citationMap : {},
        citationsFinal: state.citationsFinal === true,
        answerStatus: state.answerStatus ?? null,
      })
    }

    const PILL_CSS = `
.zs-selpill { position:fixed; z-index:40; box-sizing:border-box; appearance:none; margin:0;
  display:inline-flex; align-items:center; gap:6px; padding:5px 10px;
  border-radius:999px; border:0;
  background:var(--dsw-alias-button-floating-fill, #fff); color:var(--dsw-alias-label-primary, #1B1D21);
  font-family:inherit; font-size:13px; font-weight:500; line-height:1.2; white-space:nowrap; cursor:pointer;
  box-shadow:var(--dsw-elevation-panel, 0 6px 18px rgba(15,23,42,.16)); pointer-events:auto; user-select:none; }
.zs-selpill:hover { background:var(--dsw-alias-button-floating-hover, #F4F7FB); }
.zs-selpill:focus-visible { outline:2px solid var(--dsw-alias-brand-primary, ${BLUE}); outline-offset:2px; }
.zs-selpill svg { flex:none; color:${BLUE}; }
body[data-ds-dark-theme] .zs-selpill svg { color:#4C9BFF; }
`

    const CSS = `
.zs-root {
  --zs-brand:#056DE8; --zs-brand-strong:#0459C2;
  --zs-brand-soft:rgba(5,109,232,.08); --zs-brand-ring:rgba(5,109,232,.22);
  --zs-grad:linear-gradient(135deg,#1A8CFF 0%,#056DE8 45%,#4176E6 100%);
  --zs-aurora-1:rgba(120,184,255,.55); --zs-aurora-2:rgba(183,200,254,.6); --zs-aurora-3:rgba(5,109,232,.16);
  --zs-wash-1:rgba(5,109,232,.17); --zs-wash-2:rgba(99,122,255,.09);
  --zs-grid:rgba(15,17,21,.026);
  --zs-bg:var(--dsw-alias-bg-base,#fff);
  --zs-surface:var(--dsw-alias-bg-layer-1,#fff);
  --zs-sunken:var(--dsw-alias-bg-module-platform,#f5f6f7);
  --zs-hover:var(--dsw-alias-button-floating-hover,#f1f3f5);
  --zs-ink:var(--dsw-alias-label-primary,#0f1115);
  --zs-ink-2:var(--dsw-alias-label-secondary,#61666b);
  --zs-ink-3:var(--dsw-alias-label-tertiary,#81858c);
  --zs-line:var(--dsw-alias-border-l1,rgba(0,0,0,.04));
  --zs-line-2:var(--dsw-alias-border-l2,rgba(0,0,0,.1));
  --zs-shadow:var(--dsw-elevation-panel,0 0 0 .5px rgba(0,0,0,.1),0 3px 8px rgba(0,0,0,.03),0 0 16px rgba(0,0,0,.02));
  --zs-shadow-up:var(--dsw-elevation-prominent,0 0 0 .5px rgba(0,0,0,.12),0 3px 8px rgba(0,0,0,.04),0 0 20px rgba(0,0,0,.05));
  --zs-skel:var(--dsw-alias-bg-skeleton,rgba(0,0,0,.04));
  --zs-card-foot:#F8FBFF; --zs-card-line:#EEF4FB;
  --zs-ok:var(--dsw-alias-state-success-primary,#22a06b);
  --zs-err:var(--dsw-alias-state-error-primary,#d92d20);
  --zs-ease:cubic-bezier(.2,.8,.2,1);
  position:relative; display:flex; flex-direction:column; height:100%; min-height:0; overflow:hidden;
  background:var(--zs-bg); color:var(--zs-ink);
  font-family:var(--dsw-font-family,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif);
  -webkit-font-smoothing:antialiased; }
body[data-ds-dark-theme] .zs-root {
  --zs-brand:#4C9BFF; --zs-brand-strong:#78B3FF;
  --zs-brand-soft:rgba(76,155,255,.14); --zs-brand-ring:rgba(76,155,255,.34);
  --zs-grad:linear-gradient(135deg,#5FAEFF 0%,#2F86F6 45%,#5686FE 100%);
  --zs-aurora-1:rgba(30,90,180,.42); --zs-aurora-2:rgba(70,84,160,.38); --zs-aurora-3:rgba(76,155,255,.12);
  --zs-wash-1:rgba(76,155,255,.14); --zs-wash-2:rgba(120,140,255,.08);
  --zs-grid:rgba(255,255,255,.03); }
.zs-root.zs-theme-dark {
  --zs-brand:#4C9BFF; --zs-brand-strong:#78B3FF;
  --zs-brand-soft:rgba(76,155,255,.14); --zs-brand-ring:rgba(76,155,255,.34);
  --zs-grad:linear-gradient(135deg,#5FAEFF 0%,#2F86F6 45%,#5686FE 100%);
  --zs-aurora-1:rgba(30,90,180,.42); --zs-aurora-2:rgba(70,84,160,.38); --zs-aurora-3:rgba(76,155,255,.12);
  --zs-wash-1:rgba(76,155,255,.14); --zs-wash-2:rgba(120,140,255,.08);
  --zs-grid:rgba(255,255,255,.03);
  --zs-bg:#17181c; --zs-surface:#1f2126; --zs-sunken:#24272e; --zs-hover:#2b2f37;
  --zs-ink:#f2f4f7; --zs-ink-2:#a8adb7; --zs-ink-3:#7f8590;
  --zs-line:rgba(255,255,255,.06); --zs-line-2:rgba(255,255,255,.12);
  --zs-shadow:0 0 0 .5px rgba(255,255,255,.08), 0 3px 8px rgba(0,0,0,.28);
  --zs-shadow-up:0 0 0 .5px rgba(255,255,255,.12), 0 12px 28px rgba(0,0,0,.42);
  --zs-skel:rgba(255,255,255,.06);
  --zs-card-foot:#20232a; --zs-card-line:rgba(255,255,255,.08); }
body[data-ds-dark-theme] .zs-root.zs-theme-light {
  --zs-brand:#056DE8; --zs-brand-strong:#0459C2;
  --zs-brand-soft:rgba(5,109,232,.08); --zs-brand-ring:rgba(5,109,232,.22);
  --zs-grad:linear-gradient(135deg,#1A8CFF 0%,#056DE8 45%,#4176E6 100%);
  --zs-aurora-1:rgba(120,184,255,.55); --zs-aurora-2:rgba(183,200,254,.6); --zs-aurora-3:rgba(5,109,232,.16);
  --zs-wash-1:rgba(5,109,232,.17); --zs-wash-2:rgba(99,122,255,.09);
  --zs-grid:rgba(15,17,21,.026);
  --zs-bg:#fff; --zs-surface:#fff; --zs-sunken:#f5f6f7; --zs-hover:#f1f3f5;
  --zs-ink:#0f1115; --zs-ink-2:#61666b; --zs-ink-3:#81858c;
  --zs-line:rgba(0,0,0,.04); --zs-line-2:rgba(0,0,0,.1);
  --zs-shadow:0 0 0 .5px rgba(0,0,0,.1),0 3px 8px rgba(0,0,0,.03),0 0 16px rgba(0,0,0,.02);
  --zs-shadow-up:0 0 0 .5px rgba(0,0,0,.12),0 3px 8px rgba(0,0,0,.04),0 0 20px rgba(0,0,0,.05);
  --zs-skel:rgba(0,0,0,.04);
  --zs-card-foot:#F8FBFF; --zs-card-line:#EEF4FB; }
.zs-root[data-size="sm"] .zs-answer { font-size:14.5px; }
.zs-root[data-size="sm"] .zs-answer > p:first-child { font-size:15.5px; }
.zs-root[data-size="lg"] .zs-answer { font-size:16.8px; line-height:1.95; }
.zs-root[data-size="lg"] .zs-answer > p:first-child { font-size:18px; }
.zs-root[data-density="compact"] .zs-left { padding-top:28px; padding-bottom:56px; }
.zs-root[data-density="compact"] .zs-answer p { margin:10px 0; }
.zs-root[data-density="compact"] .zs-answer h2 { margin:24px 0 8px; }
.zs-root[data-density="compact"] .zs-answer h3 { margin:18px 0 6px; }
.zs-root[data-density="compact"] .zs-answer ul, .zs-root[data-density="compact"] .zs-answer ol { margin:8px 0 10px; }
.zs-root[data-density="compact"] .zs-group { margin-bottom:22px; }
.zs-root[data-density="compact"] .zs-quote { margin-bottom:10px; }
.zs-root[data-density="compact"] .zs-rhead { margin-bottom:10px; }
.zs-root[data-motion="off"] *, .zs-root[data-motion="off"] *::before, .zs-root[data-motion="off"] *::after {
  animation:none !important; transition:none !important; scroll-behavior:auto !important; }
.zs-root *, .zs-root *::before, .zs-root *::after { box-sizing:border-box; }
.zs-root button { font-family:inherit; }
.zs-root ::selection { background:var(--zs-brand-ring); }
.zs-scroll::-webkit-scrollbar { width:8px; }
.zs-scroll::-webkit-scrollbar-thumb { background:transparent; border-radius:8px; border:2px solid transparent; background-clip:content-box; }
.zs-scroll:hover::-webkit-scrollbar-thumb { background-color:var(--zs-line-2); }
.zs-ico { flex:none; display:block; }

/* ---------- Hero ---------- */
.zs-hero { flex:1; position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center;
  padding:0 24px 40px; isolation:isolate; overflow:auto;
  background-color:var(--zs-bg);
  background-image:
    radial-gradient(110% 64% at 50% -10%, var(--zs-wash-1) 0%, transparent 62%),
    radial-gradient(54% 44% at 94% -8%, var(--zs-wash-2) 0%, transparent 70%); }
.zs-hero > :not(.zs-dragstrip):not(.zs-aura) { position:relative; z-index:1; }
.zs-dragstrip { position:absolute; top:0; left:0; right:0; height:68px; z-index:0; -webkit-app-region:drag; app-region:drag; }
.zs-aura { position:absolute; inset:0; z-index:-1; pointer-events:none; overflow:hidden; }
.zs-aura::before { content:''; position:absolute; inset:0;
  background-image:linear-gradient(var(--zs-grid) 1px,transparent 1px),linear-gradient(90deg,var(--zs-grid) 1px,transparent 1px);
  background-size:44px 44px;
  -webkit-mask-image:radial-gradient(ellipse 72% 56% at 50% 30%,#000 18%,transparent 76%);
  mask-image:radial-gradient(ellipse 72% 56% at 50% 30%,#000 18%,transparent 76%); }
.zs-slogan { font-size:30px; font-weight:600; letter-spacing:.32em; text-indent:.32em; color:var(--zs-ink); margin:4px 0 44px; text-align:center; }
.zs-in { animation:zs-rise .6s var(--zs-ease) both; }
.zs-in.d1 { animation-delay:.06s } .zs-in.d2 { animation-delay:.12s } .zs-in.d3 { animation-delay:.18s } .zs-in.d4 { animation-delay:.24s }
@keyframes zs-rise { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:none } }
/* ---------- Composer / search box ---------- */
.zs-composer { width:min(680px,100%); border-radius:20px; background:var(--zs-surface);
  border:.5px solid var(--zs-line-2); padding:8px 8px 8px 20px;
  transition:border-color .18s var(--zs-ease); }
.zs-composer:focus-within { border-color:var(--zs-brand-ring); }
.zs-composer .zs-box { gap:10px; }
.zs-composer .zs-input { width:100%; height:40px; font-size:15.5px; }
.zs-box { display:flex; align-items:center; gap:8px; }
.zs-input { flex:1; min-width:0; border:0; outline:none; background:transparent; color:var(--zs-ink); font-size:15px; height:100%; font-family:inherit; }
.zs-input::placeholder { color:var(--zs-ink-3); }
.zs-submit { flex:none; width:36px; height:36px; border-radius:50%; border:0; cursor:pointer; color:#fff; background:var(--zs-brand);
  display:flex; align-items:center; justify-content:center;
  transition:transform .18s var(--zs-ease), opacity .18s; }
.zs-submit:hover:not([disabled]) { transform:translateY(-1px) scale(1.04); }
.zs-submit:active:not([disabled]) { transform:scale(.96); }
.zs-submit[disabled] { opacity:.32; box-shadow:none; cursor:default; filter:saturate(.6); }
.zs-chips { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin-top:22px; max-width:680px; }
.zs-chip { display:inline-flex; align-items:center; gap:7px; font-size:12.5px; height:32px; padding:0 14px 0 12px; border-radius:999px; cursor:pointer;
  color:var(--zs-ink-2); background:color-mix(in srgb, var(--zs-surface) 72%, transparent);
  -webkit-backdrop-filter:blur(12px); backdrop-filter:blur(12px);
  border:0; box-shadow:inset 0 0 0 .5px var(--zs-line-2);
  transition:color .16s, background .16s, box-shadow .16s, transform .16s var(--zs-ease); }
.zs-chip svg { color:var(--zs-ink-3); transition:color .16s; }
.zs-chip:hover { color:var(--zs-brand); background:var(--zs-surface); box-shadow:inset 0 0 0 .5px var(--zs-brand-ring), 0 6px 16px -8px rgba(5,109,232,.35); transform:translateY(-1px); }
.zs-chip:hover svg { color:var(--zs-brand); }
.zs-topics { display:flex; flex-direction:column; align-items:center; gap:8px; margin-top:24px; }
.zs-topics-label { font-size:10px; letter-spacing:.18em; color:var(--zs-ink-3); text-transform:uppercase; }
.zs-topic-entry { display:flex; align-items:center; gap:11px; width:min(680px,100%); padding:11px 14px; border-radius:14px;
  border:0; cursor:pointer; text-align:left; color:var(--zs-ink); font:inherit;
  background:color-mix(in srgb, var(--zs-surface) 78%, transparent);
  box-shadow:inset 0 0 0 .5px var(--zs-line-2);
  transition:box-shadow .16s, background .16s, transform .16s var(--zs-ease); }
.zs-topic-entry:hover { background:var(--zs-surface); box-shadow:inset 0 0 0 .5px var(--zs-brand-ring), 0 8px 22px -14px rgba(5,109,232,.45); transform:translateY(-1px); }
.zs-topic-entry-ico { flex:none; width:30px; height:30px; border-radius:10px; display:flex; align-items:center; justify-content:center;
  color:var(--zs-brand); background:var(--zs-brand-soft); }
.zs-topic-entry-main { flex:1; min-width:0; }
.zs-topic-entry-title { display:block; font-size:13.5px; font-weight:650; }
.zs-topic-entry-desc { display:block; margin-top:2px; font-size:11.5px; color:var(--zs-ink-3); }
.zs-topic-entry > .zs-ico { flex:none; color:var(--zs-ink-3); }
.zs-plugins { flex:1; min-height:0; overflow:auto; padding:26px clamp(20px,4vw,48px) 56px; background:var(--zs-bg); }
.zs-plugins-head { display:flex; align-items:flex-start; gap:12px; max-width:1120px; margin:0 auto; }
.zs-plugins-headtext { min-width:0; }
.zs-plugins-title { margin:0; font-size:24px; line-height:1.3; font-weight:650; letter-spacing:-.01em; color:var(--zs-ink); }
.zs-plugins-sub { margin:5px 0 0; font-size:12.5px; color:var(--zs-ink-3); }
.zs-plugins-search { display:flex; align-items:center; gap:8px; max-width:1120px; height:38px; margin:18px auto; padding:0 12px;
  border-radius:11px; background:var(--zs-sunken); box-shadow:inset 0 0 0 .5px var(--zs-line-2); }
.zs-plugins-search .zs-ico { flex:none; color:var(--zs-ink-3); }
.zs-plugins-search input { flex:1; min-width:0; border:0; outline:none; background:transparent; color:var(--zs-ink); font:inherit; font-size:13px; }
.zs-plugins-search input::placeholder { color:var(--zs-ink-3); }
.zs-plugin-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:12px; max-width:1120px; margin:0 auto; }
.zs-plugin-tile { display:flex; flex-direction:column; gap:8px; min-height:146px; padding:15px 16px; border:0; border-radius:15px;
  cursor:pointer; text-align:left; color:var(--zs-ink); background:var(--zs-surface); font:inherit;
  box-shadow:inset 0 0 0 .5px var(--zs-line-2), 0 2px 8px -6px rgba(15,23,42,.18);
  transition:transform .16s var(--zs-ease), box-shadow .16s; }
.zs-plugin-tile:hover { transform:translateY(-2px); box-shadow:inset 0 0 0 .5px var(--zs-brand-ring), 0 14px 28px -20px rgba(15,23,42,.35); }
.zs-plugin-tile-top { display:flex; align-items:center; gap:8px; min-width:0; }
.zs-plugin-tile-name { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:14.5px; font-weight:650; }
.zs-plugin-tag { flex:none; margin-left:auto; max-width:48%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  padding:2px 7px; border-radius:999px; font-size:10px; color:var(--zs-ink-3); background:var(--zs-sunken); }
.zs-plugin-tile-desc { display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;
  font-size:12.5px; line-height:1.6; color:var(--zs-ink-2); }
.zs-plugin-tile-stats { display:flex; gap:12px; margin-top:auto; font-size:11px; color:var(--zs-ink-3); }
.zs-plugins-note { max-width:1120px; margin:20px auto 0; font-size:11px; line-height:1.6; color:var(--zs-ink-3); }
.zs-plugins-state { display:flex; flex-direction:column; align-items:center; gap:10px; max-width:1120px; margin:64px auto; text-align:center;
  font-size:12.5px; color:var(--zs-ink-3); }
.zs-plugins-state b { color:var(--zs-ink); font-size:14px; }
.zs-plugin-card { margin:0 0 26px; padding:18px; border-radius:16px; background:var(--zs-surface);
  box-shadow:inset 0 0 0 .5px var(--zs-line-2), 0 8px 24px -22px rgba(15,23,42,.3); }
.zs-plugin-eyebrow { font-size:10px; letter-spacing:.16em; color:var(--zs-brand); text-transform:uppercase; }
.zs-plugin-name { margin:6px 0 7px; font-size:24px; line-height:1.25; font-weight:650; letter-spacing:-.015em; color:var(--zs-ink); word-break:break-word; }
.zs-plugin-meta { display:flex; flex-wrap:wrap; gap:10px; font-size:11.5px; color:var(--zs-ink-3); }
.zs-plugin-desc { margin:12px 0 14px; font-size:13px; line-height:1.7; color:var(--zs-ink-2); }
.zs-plugin-actions { display:flex; flex-wrap:wrap; align-items:center; gap:10px; }
.zs-plugin-link { display:inline-flex; align-items:center; gap:4px; font-size:12px; color:var(--zs-brand); text-decoration:none; }
.zs-plugin-link:hover { text-decoration:underline; }
.zs-plugin-install { height:32px; padding:0 14px; border:0; border-radius:9px; cursor:pointer;
  color:#fff; background:var(--zs-brand); font:inherit; font-size:12.5px; font-weight:600;
  transition:transform .16s var(--zs-ease), opacity .16s; }
.zs-plugin-install:hover:not([disabled]) { transform:translateY(-1px); }
.zs-plugin-install[disabled] { opacity:.5; cursor:default; }
.zs-plugin-code { display:block; margin-top:10px; padding:7px 9px; overflow:auto; white-space:nowrap;
  border-radius:8px; background:var(--zs-sunken); color:var(--zs-ink-2); font-size:11px; }
.zs-install-backdrop { position:fixed; inset:0; z-index:120; display:flex; align-items:center; justify-content:center; padding:24px;
  background:rgba(15,23,42,.35); -webkit-backdrop-filter:blur(3px); backdrop-filter:blur(3px); }
.zs-install-dialog { width:min(440px,100%); padding:20px; border-radius:18px; background:var(--zs-surface);
  box-shadow:0 26px 70px -24px rgba(15,23,42,.55), inset 0 0 0 .5px var(--zs-line-2); }
.zs-install-head { display:flex; align-items:center; gap:12px; }
.zs-install-head h2 { flex:1; margin:0; font-size:16px; font-weight:650; color:var(--zs-ink); }
.zs-install-close { flex:none; width:28px; height:28px; border:0; border-radius:8px; cursor:pointer; color:var(--zs-ink-3);
  background:transparent; font-size:20px; line-height:1; }
.zs-install-close:hover { background:var(--zs-sunken); color:var(--zs-ink); }
.zs-install-text { margin:14px 0 0; font-size:13px; line-height:1.65; color:var(--zs-ink-2); }
.zs-install-code { display:block; margin-top:10px; padding:8px 10px; overflow:auto; white-space:nowrap;
  border-radius:8px; background:var(--zs-sunken); color:var(--zs-ink-2); font-size:11px; }
.zs-install-warn { margin:12px 0 0; padding:10px 12px; border-radius:9px; font-size:11.5px; line-height:1.6;
  color:#8a5a00; background:#fff7e6; }
.zs-theme-dark .zs-install-warn { color:#f5c56b; background:rgba(245,197,107,.12); }
.zs-install-error { margin:14px 0 0; font-size:12.5px; line-height:1.6; color:#c0392b; }
.zs-install-actions { display:flex; justify-content:flex-end; flex-wrap:wrap; gap:8px; margin-top:18px; }
.zs-install-btn { height:32px; padding:0 14px; border:0; border-radius:9px; cursor:pointer; font:inherit; font-size:12.5px;
  color:var(--zs-ink-2); background:var(--zs-sunken); }
.zs-install-btn:hover { color:var(--zs-ink); }
.zs-install-btn.primary { color:#fff; background:var(--zs-brand); font-weight:600; }

/* ---------- Topbar ---------- */
.zs-topbar { display:flex; align-items:center; gap:10px; padding:12px 20px; min-height:62px;
  border-bottom:.5px solid var(--zs-line-2);
  background:color-mix(in srgb, var(--zs-bg) 86%, transparent);
  -webkit-backdrop-filter:saturate(1.4) blur(16px); backdrop-filter:saturate(1.4) blur(16px);
  -webkit-app-region:drag; app-region:drag; position:relative; z-index:5; }
.zs-topbar .zs-back, .zs-topbar .zs-box, .zs-topbar input, .zs-topbar button, .zs-topbar .zs-stats {
  -webkit-app-region:no-drag; app-region:no-drag; }
.zs-results-on .zs-topbar { padding-right:116px; }
.zs-topbar .zs-box { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
  width:min(560px, max(240px, calc(100% - 340px))); height:38px; padding:0 4px 0 12px; border-radius:12px;
  background:var(--zs-sunken); box-shadow:inset 0 0 0 .5px var(--zs-line-2); transition:box-shadow .18s, background .18s; }
.zs-topbar .zs-box:focus-within { background:var(--zs-surface); box-shadow:0 0 0 1px var(--zs-brand-ring), 0 0 0 4px var(--zs-brand-soft); }
.zs-topbar .zs-box > .zs-ico { color:var(--zs-ink-3); }
.zs-topbar .zs-input { font-size:13.5px; }
.zs-topbar .zs-submit { width:30px; height:30px; border-radius:9px; }
.zs-back { flex:none; width:34px; height:34px; border-radius:10px; cursor:pointer; color:var(--zs-ink-2);
  background:transparent; border:0; display:flex; align-items:center; justify-content:center; transition:background .16s, color .16s; }
.zs-back:hover { background:var(--zs-hover); color:var(--zs-ink); }
.zs-stats { margin-left:auto; flex:none; display:inline-flex; align-items:center; height:28px; padding:0 4px; border-radius:999px;
  background:var(--zs-sunken); box-shadow:inset 0 0 0 .5px var(--zs-line); font-size:11.5px; color:var(--zs-ink-2);
  font-variant-numeric:tabular-nums; white-space:nowrap; }
.zs-stat { display:inline-flex; align-items:center; gap:5px; padding:0 9px; }
.zs-stat + .zs-stat { border-left:.5px solid var(--zs-line-2); }
.zs-stat b { font-weight:600; color:var(--zs-ink); }
.zs-stat.accent b { color:var(--zs-brand); }
.zs-dot { width:6px; height:6px; border-radius:50%; background:var(--zs-ink-3); }
.zs-dot.z { background:var(--zs-brand); } .zs-dot.w { background:#8B7CF6; }
.zs-stats.live { color:var(--zs-ink-2); padding:0 12px; gap:8px; }
.zs-spin { width:12px; height:12px; border-radius:50%; border:1.6px solid var(--zs-brand-ring); border-top-color:var(--zs-brand); animation:zs-rot .8s linear infinite; }
@keyframes zs-rot { to { transform:rotate(360deg) } }
.zs-progress { position:absolute; left:0; right:0; bottom:-1px; height:2px; overflow:hidden; pointer-events:none; }
.zs-progress::after { content:''; position:absolute; top:0; bottom:0; width:38%; left:-40%; background:var(--zs-grad); border-radius:2px;
  animation:zs-bar 1.3s var(--zs-ease) infinite; }
@keyframes zs-bar { to { left:102% } }
/* ---------- Results layout ---------- */
.zs-body { flex:1; min-height:0; display:flex; gap:0; }
.zs-left { width:48%; min-width:360px; max-width:760px; flex:none; overflow:auto; padding:40px clamp(28px, 4vw, 52px) 80px;
  border-right:.5px solid var(--zs-line-2); }
.zs-left > * { max-width:680px; }
.zs-right { flex:1; min-width:0; overflow:auto; padding:22px 24px 64px; background:var(--zs-sunken); }
.zs-answer { font-size:15.5px; line-height:1.9; color:var(--zs-ink); word-break:break-word; letter-spacing:.01em;
  text-wrap:pretty; font-feature-settings:'palt' 0; }
.zs-answer > :first-child { margin-top:10px; }
.zs-answer > :last-child { margin-bottom:0; }
.zs-answer > p:first-child { font-size:16.5px; line-height:1.85; margin-bottom:22px; }
.zs-answer h2 { position:relative; font-size:16.5px; line-height:1.5; font-weight:650; margin:34px 0 12px; padding:0 0 0 13px; border:0; letter-spacing:0; }
.zs-answer h2::before { content:''; position:absolute; left:0; top:.28em; bottom:.28em; width:3px; border-radius:3px; background:var(--zs-grad); }
.zs-answer h3 { font-size:15.5px; font-weight:650; margin:24px 0 8px; }
.zs-answer h1 { font-size:20px; line-height:1.45; font-weight:680; letter-spacing:-.01em; margin:30px 0 12px; }
.zs-answer h4 { font-size:15px; font-weight:650; margin:20px 0 6px; }
.zs-answer h5, .zs-answer h6 { font-size:14px; font-weight:650; margin:18px 0 6px; color:var(--zs-ink-2); }
.zs-answer h1 + p, .zs-answer h2 + p, .zs-answer h3 + p, .zs-answer h4 + p,
.zs-answer h1 + ul, .zs-answer h2 + ul, .zs-answer h3 + ul, .zs-answer h4 + ul,
.zs-answer h1 + ol, .zs-answer h2 + ol, .zs-answer h3 + ol, .zs-answer h4 + ol { margin-top:0; }
.zs-answer p { margin:14px 0; }
.zs-answer ul, .zs-answer ol { margin:12px 0 16px; padding-left:24px; }
.zs-answer li { margin:9px 0; padding-left:4px; }
.zs-answer li > p { margin:4px 0 8px; }
.zs-answer li > p:first-child { margin-top:0; }
.zs-answer li > p:last-child { margin-bottom:0; }
.zs-answer li ul, .zs-answer li ol { margin:6px 0 4px; }
.zs-answer .zs-task-item { list-style:none; display:flex; align-items:flex-start; gap:8px; margin-left:-20px; }
.zs-answer .zs-task { flex:none; margin:6px 0 0; accent-color:var(--zs-brand); }
.zs-answer .zs-task-item > *:not(.zs-task) { min-width:0; }
.zs-answer li::marker { color:var(--zs-ink-3); }
.zs-answer ul > li::marker { content:'•  '; color:var(--zs-brand); font-weight:700; }
.zs-answer ol > li::marker { font-variant-numeric:tabular-nums; font-weight:650; color:var(--zs-brand); }
.zs-answer strong { font-weight:650; color:var(--zs-ink);
  background:linear-gradient(transparent 62%, var(--zs-brand-soft) 62%); padding:0 1px; }
.zs-answer em { font-style:normal; color:var(--zs-ink); text-decoration:underline; text-decoration-color:var(--zs-brand-ring); text-underline-offset:3px; }
.zs-answer blockquote { margin:16px 0; padding:2px 0 2px 16px; border-left:3px solid var(--zs-brand-ring); color:var(--zs-ink-2); }
.zs-answer blockquote p { margin:6px 0; }
.zs-answer blockquote blockquote { margin:10px 0; }
.zs-answer del { color:var(--zs-ink-3); text-decoration-thickness:1px; }
.zs-answer .zs-img { display:block; max-width:100%; height:auto; margin:16px 0; border-radius:12px;
  box-shadow:0 1px 2px rgba(23,43,77,.05), 0 8px 24px -12px rgba(23,43,77,.18); }
.zs-answer .zs-img-fallback { color:var(--zs-ink-3); font-size:12px; }
.zs-answer hr { border:0; height:.5px; background:var(--zs-line-2); margin:28px 0; }
.zs-answer .zs-table { margin:16px 0; overflow-x:auto; border-radius:12px; box-shadow:inset 0 0 0 .5px var(--zs-line-2); }
.zs-answer table { width:100%; border-collapse:collapse; font-size:13.5px; line-height:1.6; }
.zs-answer th, .zs-answer td { padding:9px 14px; text-align:left; vertical-align:top; border-bottom:.5px solid var(--zs-line-2); }
.zs-answer th { font-weight:600; background:var(--zs-sunken); white-space:nowrap; }
.zs-answer tr:last-child td { border-bottom:0; }
.zs-qtitle { font-size:22px; line-height:1.5; font-weight:650; letter-spacing:-.005em; color:var(--zs-ink); margin:0 0 30px; word-break:break-word; }
@keyframes zs-breathe { 50% { opacity:.25; transform:scale(.7) } }
.zs-card { clear:both; padding:4px 0 0; }
.zs-answer code { background:var(--zs-sunken); box-shadow:inset 0 0 0 .5px var(--zs-line-2); border-radius:6px; padding:1px 6px; font-size:.88em;
  color:var(--zs-ink); font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace); }
.zs-answer .zs-codeblock { margin:18px 0; border-radius:14px; overflow:hidden; background:var(--zs-sunken);
  box-shadow:inset 0 0 0 .5px var(--zs-line-2); }
.zs-answer .zs-codehead { display:flex; align-items:center; height:32px; padding:0 12px; border-bottom:.5px solid var(--zs-line-2);
  font-size:11px; color:var(--zs-ink-3); font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace); }
.zs-answer .zs-codecopy { margin-left:auto; border:0; background:transparent; color:var(--zs-ink-3); font-size:11px; cursor:pointer;
  padding:2px 7px; border-radius:6px; font-family:inherit; }
.zs-answer .zs-codecopy:hover { background:var(--zs-hover); color:var(--zs-ink); }
.zs-answer .zs-codeblock pre { margin:0; padding:14px 16px; overflow:auto; font-size:13px; line-height:1.7; white-space:pre; word-break:normal; }
.zs-answer .zs-codeblock code { background:none; box-shadow:none; border-radius:0; padding:0; font-size:13px; color:var(--zs-ink); }
.zs-answer a { color:var(--zs-brand); text-decoration:none; border-bottom:1px solid var(--zs-brand-ring); }
.zs-answer a:hover { border-bottom-color:var(--zs-brand); }
.zs-cite { display:inline-flex; align-items:center; justify-content:center; min-width:17px; height:17px; padding:0 4px; margin:0 1px 0 3px;
  border-radius:6px; font-size:10.5px; font-weight:600; line-height:1; vertical-align:2px; cursor:pointer;
  font-family:var(--dsw-font-family-brand,'Montserrat',sans-serif); font-variant-numeric:tabular-nums;
  color:var(--zs-brand); background:var(--zs-brand-soft); border:0; transition:background .14s, color .14s, transform .14s; }
.zs-cite:hover, .zs-cite:focus-visible { background:var(--zs-brand); color:#fff; transform:translateY(-1px); outline:none; }
.zs-cite.pending { color:transparent; cursor:default; background:var(--zs-brand-soft); position:relative; }
.zs-cite.pending::after { content:''; position:absolute; left:50%; top:50%; width:5px; height:5px; margin:-2.5px 0 0 -2.5px;
  border-radius:50%; background:var(--zs-brand); animation:zs-breathe 1.2s ease-in-out infinite; }
.zs-cite.pending:hover { color:transparent; background:var(--zs-brand-soft); transform:none; }
.zs-cite.missing { color:var(--zs-ink-3); background:var(--zs-sunken); cursor:default; }
.zs-cite.missing:hover { color:var(--zs-ink-3); background:var(--zs-sunken); transform:none; }
.zs-caret { display:inline-block; width:7px; height:16px; margin-left:3px; vertical-align:-3px; background:var(--zs-grad);
  border-radius:2px; animation:zs-blink 1s step-end infinite; }
@keyframes zs-blink { 50% { opacity:0 } }
.zs-actions { display:flex; align-items:center; gap:4px; margin-top:32px; padding-top:16px; border-top:.5px solid var(--zs-line-2); }
.zs-action { height:30px; padding:0 10px; gap:6px; border-radius:9px; border:0; background:transparent; color:var(--zs-ink-3); cursor:pointer;
  display:inline-flex; align-items:center; justify-content:center; font-size:12px; transition:background .14s, color .14s; }
.zs-action:hover { background:var(--zs-hover); color:var(--zs-ink); }
.zs-action.ok { color:var(--zs-ok); }
.zs-actnote { margin-left:auto; font-size:11px; color:var(--zs-ink-3); }

/* ---------- Evidence ---------- */
.zs-rhead { display:flex; align-items:baseline; gap:8px; margin:0 2px 14px; }
.zs-rhead h3 { margin:0; font-size:13px; font-weight:600; color:var(--zs-ink); }
.zs-rhead span { font-size:11.5px; color:var(--zs-ink-3); }
.zs-flow { display:flex; gap:12px; align-items:flex-start; }
.zs-col { flex:1; min-width:0; }
.zs-quote { position:relative; margin:0 0 14px; border-radius:20px; cursor:pointer; overflow:hidden; border:0;
  background:var(--zs-surface); box-shadow:0 2px 10px rgba(23,43,77,.05); transition:box-shadow .18s, transform .18s; }
.zs-quote:hover { box-shadow:0 12px 28px rgba(0,132,255,.16); transform:translateY(-2px); }
.zs-quote:focus-visible { outline:none; box-shadow:0 0 0 3px rgba(0,132,255,.22); }
.zs-quote.flash { box-shadow:0 0 0 3px rgba(0,132,255,.22); }
.zs-float { animation:zs-floatin .32s ease-out both; }
@keyframes zs-floatin { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:none } }
.zs-idx { position:absolute; top:12px; right:14px; font-size:10px; font-weight:700; color:var(--zs-ink-3); }
.zs-qbody { position:relative; padding:20px 18px 14px; }
.zs-mark { position:absolute; top:2px; left:12px; font-family:Georgia,serif; font-size:46px; line-height:1; color:var(--zs-brand-soft); user-select:none; }
.zs-qtext { margin:12px 0 0; font-size:14px; line-height:1.78; color:var(--zs-ink);
  display:-webkit-box; -webkit-line-clamp:6; -webkit-box-orient:vertical; overflow:hidden; }
.zs-qauthor { display:flex; align-items:center; gap:9px; padding:0 18px 14px; }
.zs-avatar { width:30px; height:30px; border-radius:50%; flex:none; display:flex; align-items:center; justify-content:center;
  font-size:12px; font-weight:700; color:#fff; background:linear-gradient(135deg, #7FC0FF, #0084FF); object-fit:cover; }
.zs-aname { font-size:12.5px; font-weight:600; color:var(--zs-ink); }
.zs-abadge { font-size:10.5px; color:var(--zs-ink-3); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:170px; }
.zs-zlogo { margin-left:auto; flex:none; white-space:nowrap; font-size:13px; font-weight:700; color:var(--zs-brand); }
.zs-theme-dark .zs-quote { box-shadow:0 0 0 .5px var(--zs-line-2); }
.zs-theme-dark .zs-quote:hover { box-shadow:0 0 0 .5px var(--zs-line-2), 0 12px 28px rgba(0,0,0,.35); }
.zs-qfoot { position:relative; display:flex; align-items:center; gap:10px; padding:13px 18px 13px; background:var(--zs-card-foot); border-top:1px solid var(--zs-card-line); }
.zs-qfoot::before { content:''; position:absolute; top:-7px; left:26px; width:12px; height:12px; background:var(--zs-surface);
  border-right:1px solid var(--zs-card-line); border-bottom:1px solid var(--zs-card-line); border-bottom-right-radius:3px; transform:rotate(45deg); }
.zs-fq { font-size:12.5px; font-weight:600; line-height:1.5; color:var(--zs-ink-2);
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.zs-fmeta { font-size:10.5px; color:var(--zs-ink-3); margin-top:3px; }
.zs-arrow { margin-left:auto; flex:none; font-size:13px; color:var(--zs-ink-3); }
body[data-ds-dark-theme] .zs-quote { background:var(--zs-surface); box-shadow:0 0 0 .5px var(--zs-line-2); }
body[data-ds-dark-theme] .zs-quote:hover { box-shadow:0 0 0 .5px var(--zs-line-2), 0 12px 28px rgba(0,0,0,.35); }
body[data-ds-dark-theme] .zs-qtext, body[data-ds-dark-theme] .zs-aname { color:var(--zs-ink); }
body[data-ds-dark-theme] .zs-fq { color:var(--zs-ink-2); }
body[data-ds-dark-theme] .zs-qfoot { background:var(--zs-sunken); border-top-color:var(--zs-line-2); }
body[data-ds-dark-theme] .zs-qfoot::before { background:var(--zs-surface); border-color:var(--zs-line-2); }
body[data-ds-dark-theme] .zs-mark { color:rgba(76,155,255,.22); }
body[data-ds-dark-theme] .zs-zlogo { color:#4C9BFF; }
body[data-ds-dark-theme] .zs-idx, body[data-ds-dark-theme] .zs-arrow { color:var(--zs-ink-3); }
/* ---------- Topic & perspective groups ---------- */
.zs-topic { margin:4px 2px 22px; }
.zs-topic-q { margin:2px 0 0; font-size:19px; line-height:1.45; font-weight:650; letter-spacing:-.005em; color:var(--zs-ink); }
.zs-topic-nav { display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }
.zs-topic-chip { display:inline-flex; align-items:center; gap:7px; height:30px; padding:0 13px 0 10px; border-radius:999px; border:0; cursor:pointer;
  font-size:12.5px; font-weight:500; color:var(--zs-ink-2); background:var(--zs-surface); box-shadow:var(--zs-shadow);
  transition:color .15s, box-shadow .15s, transform .15s var(--zs-ease); }
.zs-topic-chip b { font-family:var(--dsw-font-family-brand,'Montserrat',sans-serif); font-size:10.5px; font-weight:700; color:var(--zs-brand); font-variant-numeric:tabular-nums; }
.zs-topic-chip:hover { color:var(--zs-brand); transform:translateY(-1px); box-shadow:var(--zs-shadow-up); }
.zs-group { scroll-margin-top:16px; }
.zs-group + .zs-group { margin-top:14px; }
.zs-group.extra .zs-ghead { border-top-style:dashed; }
.zs-group.extra .zs-gnum { opacity:.45; }
.zs-group.extra .zs-gq { font-size:15px; font-weight:600; color:var(--zs-ink-2); }
.zs-ghead { display:flex; align-items:flex-start; gap:12px; margin:0 2px 14px; padding-top:18px; border-top:.5px solid var(--zs-line-2); }
.zs-group:first-of-type .zs-ghead { border-top:0; padding-top:0; }
.zs-gnum { flex:none; margin-top:-1px; font-family:var(--dsw-font-family-brand,'Montserrat',sans-serif); font-size:22px; line-height:1.1; font-weight:700;
  background:var(--zs-grad); -webkit-background-clip:text; background-clip:text; color:transparent; font-variant-numeric:tabular-nums; }
.zs-gtext { flex:1; min-width:0; }
.zs-gq { margin:1px 0 0; font-size:16px; line-height:1.45; font-weight:650; color:var(--zs-ink); }
.zs-gcount { flex:none; margin-top:4px; font-size:11px; color:var(--zs-ink-3); font-variant-numeric:tabular-nums; }

/* ---------- States ---------- */
.zs-state { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; text-align:center;
  padding:72px 20px; font-size:13px; color:var(--zs-ink-3); }
.zs-state-ico { width:44px; height:44px; border-radius:14px; display:flex; align-items:center; justify-content:center;
  background:var(--zs-surface); box-shadow:var(--zs-shadow); color:var(--zs-brand); }
.zs-state b { font-size:13.5px; font-weight:600; color:var(--zs-ink); }
.zs-ghost { margin:0 0 12px; border-radius:16px; padding:16px; background:var(--zs-surface); box-shadow:var(--zs-shadow); }
.zs-err { display:flex; gap:10px; align-items:flex-start; margin:0 0 18px; padding:12px 14px; border-radius:12px; font-size:12.5px; line-height:1.6;
  color:var(--zs-err); background:color-mix(in srgb, var(--zs-err) 8%, transparent); box-shadow:inset 0 0 0 .5px color-mix(in srgb, var(--zs-err) 24%, transparent); }
.zs-warn { display:flex; gap:8px; align-items:flex-start; margin:16px 0 0; padding:10px 12px; border-radius:10px;
  font-size:12px; line-height:1.65; color:var(--zs-ink-2);
  background:color-mix(in srgb, var(--dsw-alias-state-warn-primary,#B45309) 7%, transparent);
  box-shadow:inset 0 0 0 .5px color-mix(in srgb, var(--dsw-alias-state-warn-primary,#B45309) 20%, transparent); }
.zs-warn .zs-ico { flex:none; margin-top:1px; color:var(--dsw-alias-state-warn-primary,#B45309); }
.zs-banner { display:flex; align-items:center; gap:10px; margin:0 0 20px; padding:9px 9px 9px 14px; border-radius:12px;
  background:var(--zs-surface); box-shadow:var(--zs-shadow); font-size:12.5px; color:var(--zs-ink-2); }
.zs-hero .zs-banner { width:min(680px,100%); margin-bottom:14px; }
.zs-banner .zs-ico { color:var(--zs-brand); }
.zs-banner button { margin-left:auto; flex:none; height:28px; padding:0 12px; border-radius:8px; border:0;
  background:var(--zs-ink); color:var(--zs-bg); font-size:12px; font-weight:600; cursor:pointer; transition:opacity .14s; }
.zs-banner button:hover { opacity:.86; }

/* ---------- Debug ---------- */
.zs-corner { position:absolute; top:14px; right:16px; z-index:60; display:flex; align-items:center; gap:7px;
  -webkit-app-region:no-drag; app-region:no-drag; pointer-events:auto; }
.zs-corner, .zs-corner * { -webkit-app-region:no-drag; app-region:no-drag; }
.zs-debug-wrap { position:relative; }
.zs-debug-btn { height:26px; padding:0 11px; border-radius:999px; font-size:10px; font-weight:700; letter-spacing:.08em; cursor:pointer;
  border:0; color:var(--zs-ink-3); background:var(--zs-surface); box-shadow:var(--zs-shadow);
  font-family:var(--dsw-font-family-brand,'Montserrat',sans-serif); }
.zs-debug-btn:hover { color:var(--zs-brand); }
.zs-set-btn { width:30px; height:30px; padding:0; border-radius:10px; display:inline-flex; align-items:center; justify-content:center;
  border:0; cursor:pointer; color:var(--zs-ink-3); background:var(--zs-surface); box-shadow:var(--zs-shadow); transition:color .14s, background .14s; }
.zs-set-btn:hover { color:var(--zs-brand); background:var(--zs-hover); }
.zs-debug-menu { position:absolute; right:0; top:34px; min-width:220px; padding:6px; border-radius:14px;
  background:var(--zs-surface); border:0; box-shadow:var(--zs-shadow-up), 0 20px 40px -20px rgba(0,0,0,.25); animation:zs-rise .2s var(--zs-ease) both; }
.zs-debug-item { display:block; width:100%; text-align:left; padding:8px 10px; border-radius:9px; font-size:12.5px;
  background:transparent; border:0; color:var(--zs-ink); cursor:pointer; }
.zs-debug-item:hover { background:var(--zs-hover); }
.zs-debug-status { padding:8px 10px 4px; margin-top:4px; font-size:11px; line-height:1.6; color:var(--zs-ink-3); border-top:.5px solid var(--zs-line-2); }
.zs-set-backdrop { position:absolute; inset:0; z-index:50; background:transparent; }
.zs-settings { position:absolute; top:52px; right:16px; z-index:70; width:min(420px, calc(100% - 32px)); max-height:min(72vh, calc(100% - 64px));
  overflow:auto; overscroll-behavior:contain; border-radius:18px; background:var(--zs-surface);
  box-shadow:var(--zs-shadow-up), 0 24px 60px -28px rgba(0,0,0,.4); animation:zs-rise .2s var(--zs-ease) both; }
.zs-set-head { position:sticky; top:0; z-index:1; display:flex; align-items:center; gap:10px; padding:14px 16px 12px;
  background:color-mix(in srgb, var(--zs-surface) 92%, transparent); backdrop-filter:blur(14px);
  border-bottom:.5px solid var(--zs-line-2); }
.zs-set-head b { font-size:14px; font-weight:650; }
.zs-set-close { margin-left:auto; width:26px; height:26px; border:0; border-radius:8px; background:transparent; color:var(--zs-ink-3);
  font-size:18px; line-height:1; cursor:pointer; }
.zs-set-close:hover { background:var(--zs-hover); color:var(--zs-ink); }
.zs-set-body { padding:2px 0 4px; }
.zs-set-sec { padding:14px 16px; border-top:.5px solid var(--zs-line-2); }
.zs-set-sec:first-child { border-top:0; }
.zs-set-sec h4 { margin:0 0 8px; font-size:11px; font-weight:700; letter-spacing:.08em; color:var(--zs-ink-3); text-transform:uppercase; }
.zs-set-row { display:flex; align-items:center; gap:12px; justify-content:space-between; padding:7px 0; }
.zs-set-meta { min-width:0; display:flex; flex-direction:column; gap:2px; }
.zs-set-meta b { font-size:12.5px; font-weight:600; color:var(--zs-ink); }
.zs-set-meta span { font-size:11px; line-height:1.5; color:var(--zs-ink-3); }
.zs-seg { flex:none; display:inline-flex; padding:2px; border-radius:9px; background:var(--zs-sunken); box-shadow:inset 0 0 0 .5px var(--zs-line-2); }
.zs-seg-btn { height:24px; padding:0 9px; border:0; border-radius:7px; background:transparent; color:var(--zs-ink-3);
  font-size:11px; cursor:pointer; white-space:nowrap; }
.zs-seg-btn.on { background:var(--zs-surface); color:var(--zs-ink); box-shadow:0 1px 3px rgba(0,0,0,.08); }
.zs-switch { flex:none; width:34px; height:20px; padding:2px; border:0; border-radius:999px; background:var(--zs-sunken);
  box-shadow:inset 0 0 0 .5px var(--zs-line-2); cursor:pointer; transition:background .16s; }
.zs-switch span { display:block; width:16px; height:16px; border-radius:50%; background:var(--zs-surface); box-shadow:0 1px 3px rgba(0,0,0,.18); transition:transform .16s; }
.zs-switch.on { background:var(--zs-brand); }
.zs-switch.on span { transform:translateX(14px); background:#fff; }
.zs-set-note { margin:6px 0 0; font-size:11px; line-height:1.6; color:var(--zs-ink-3); }
.zs-set-status { display:flex; align-items:center; gap:8px; padding:4px 0; font-size:11.5px; color:var(--zs-ink-2); }
.zs-set-status b { font-weight:600; color:var(--zs-ink); }
.zs-set-status span:last-child { margin-left:auto; color:var(--zs-ink-3); }
.zs-set-dot { width:6px; height:6px; border-radius:50%; background:var(--zs-ink-3); flex:none; }
.zs-set-dot.ok { background:var(--zs-ok); }
.zs-set-last { display:flex; flex-direction:column; gap:3px; margin:8px 0 2px; padding:10px 11px; border-radius:10px;
  background:var(--zs-sunken); font-size:10.5px; line-height:1.55; color:var(--zs-ink-2); }
.zs-set-last b { display:block; font-size:11.5px; font-weight:600; color:var(--zs-ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.zs-set-actions { display:flex; gap:6px; margin-top:10px; flex-wrap:wrap; }
.zs-set-actions button, .zs-set-danger { height:27px; padding:0 10px; border:0; border-radius:8px; cursor:pointer;
  background:var(--zs-sunken); color:var(--zs-ink-2); font-size:11px; box-shadow:inset 0 0 0 .5px var(--zs-line-2); }
.zs-set-actions button:hover { color:var(--zs-ink); background:var(--zs-hover); }
.zs-set-danger { color:var(--zs-err); background:transparent; box-shadow:inset 0 0 0 .5px color-mix(in srgb, var(--zs-err) 28%, transparent); }
.zs-set-danger:hover { background:color-mix(in srgb, var(--zs-err) 8%, transparent); }
.zs-set-about { display:flex; flex-direction:column; gap:4px; font-size:11px; line-height:1.6; color:var(--zs-ink-3); }
.zs-set-about b { font-size:12px; color:var(--zs-ink); }
.zs-set-foot { display:flex; align-items:center; gap:10px; padding:12px 16px 14px; border-top:.5px solid var(--zs-line-2); }
.zs-set-reset { height:28px; padding:0 11px; border:0; border-radius:8px; background:var(--zs-sunken); color:var(--zs-ink-2);
  font-size:11px; cursor:pointer; box-shadow:inset 0 0 0 .5px var(--zs-line-2); }
.zs-set-reset:hover { color:var(--zs-ink); background:var(--zs-hover); }
.zs-set-foot > span { margin-left:auto; font-size:10px; color:var(--zs-ink-3); }

/* ---------- Onboarding ---------- */
.zs-setup-wrap { flex:1; overflow:auto; position:relative; isolation:isolate;
  background-color:var(--zs-bg);
  background-image:
    radial-gradient(110% 64% at 50% -10%, var(--zs-wash-1) 0%, transparent 62%),
    radial-gradient(54% 44% at 94% -8%, var(--zs-wash-2) 0%, transparent 70%); }
.zs-onb { position:relative; z-index:1; max-width:680px; margin:0 auto; padding:72px 28px 80px; }
.zs-onb-head { max-width:560px; margin:0 auto; text-align:center; }
.zs-onb-eyebrow { display:inline-flex; align-items:center; gap:8px; font-size:10.5px; font-weight:600;
  letter-spacing:.12em; color:var(--zs-ink-3); text-transform:uppercase; }
.zs-onb-dot { width:6px; height:6px; border-radius:50%; background:var(--zs-brand); box-shadow:0 0 0 4px var(--zs-brand-soft); }
.zs-onb h1 { margin:16px 0 0; font-size:30px; line-height:1.3; font-weight:680; letter-spacing:-.02em; color:var(--zs-ink); }
.zs-onb-progress { display:flex; align-items:center; gap:10px; max-width:420px; margin:20px auto 0;
  font-size:10.5px; color:var(--zs-ink-3); font-variant-numeric:tabular-nums; }
.zs-onb-track { flex:1; height:3px; border-radius:99px; overflow:hidden; background:var(--zs-sunken); }
.zs-onb-track i { display:block; height:100%; border-radius:inherit; background:var(--zs-grad); transition:width .3s var(--zs-ease); }
.zs-onb-card { margin-top:26px; border-radius:22px; overflow:hidden; background:var(--zs-surface); box-shadow:var(--zs-shadow); }
.zs-onb-step { display:flex; gap:16px; padding:18px 22px; border-top:.5px solid var(--zs-line-2); }
.zs-onb-step:first-child { border-top:0; }
.zs-onb-step.pending { opacity:.68; }
.zs-onb-num { width:26px; height:26px; flex:none; border-radius:9px; display:flex; align-items:center; justify-content:center;
  font-size:10px; font-weight:700; color:var(--zs-ink-3); background:var(--zs-sunken);
  box-shadow:inset 0 0 0 .5px var(--zs-line-2); font-family:var(--dsw-font-family-brand,'Montserrat',sans-serif); }
.zs-onb-num.active { color:#fff; background:var(--zs-grad); box-shadow:none; }
.zs-onb-num.done { color:var(--zs-brand); background:var(--zs-brand-soft); box-shadow:none; }
.zs-onb-main { flex:1; min-width:0; }
.zs-onb-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.zs-onb-side { margin-left:auto; flex:none; }
.zs-onb-title { margin:0; font-size:14px; line-height:1.4; font-weight:650; color:var(--zs-ink); }
.zs-onb-pill { display:inline-flex; align-items:center; height:18px; padding:0 7px; border-radius:999px;
  font-size:10px; font-weight:600; color:var(--zs-ink-3); background:var(--zs-sunken); }
.zs-onb-pill.done { color:var(--zs-brand); background:var(--zs-brand-soft); }
.zs-onb-desc { margin:5px 0 0; font-size:12px; line-height:1.7; color:var(--zs-ink-3); }
.zs-onb-actions { display:flex; align-items:center; gap:10px; margin-top:10px; flex-wrap:wrap; }
.zs-onb-text { padding:4px 2px; border:0; background:transparent; color:var(--zs-ink-3); font-size:11.5px; cursor:pointer; }
.zs-onb-text:hover { color:var(--zs-brand); }
.zs-onb-form { flex:1 1 280px; min-width:0; display:flex; gap:8px; margin-top:2px; }
.zs-onb-form .zs-field { height:34px; font-size:12.5px; }
.zs-onb-form .zs-btn { flex:none; height:34px; padding:0 14px; font-size:12px; }
.zs-onb-hint { display:inline-flex; align-items:center; gap:4px; color:var(--zs-ink-3); text-decoration:none;
  font-size:11px; border-bottom:.5px solid var(--zs-line-2); }
.zs-onb-hint:hover { color:var(--zs-brand); border-bottom-color:var(--zs-brand-ring); }
.zs-onb-logs { margin-top:10px; }
.zs-onb-msg { margin-top:14px; padding:10px 14px; border-radius:12px; font-size:12px; line-height:1.6;
  color:var(--zs-ink-2); background:var(--zs-surface); box-shadow:var(--zs-shadow); }
.zs-onb-foot { display:flex; align-items:center; justify-content:center; gap:7px; margin-top:20px;
  font-size:10.5px; line-height:1.6; color:var(--zs-ink-3); text-align:center; }
.zs-onb-foot .zs-ico { opacity:.7; }

.zs-field { flex:1; height:36px; padding:0 14px; border-radius:10px; border:0; background:var(--zs-sunken);
  box-shadow:inset 0 0 0 .5px var(--zs-line-2); color:var(--zs-ink); font-size:13px; outline:none; font-family:inherit; transition:box-shadow .16s, background .16s; }
.zs-field:focus { box-shadow:0 0 0 1px var(--zs-brand-ring), 0 0 0 4px var(--zs-brand-soft); background:var(--zs-surface); }
.zs-btn { display:inline-flex; align-items:center; justify-content:center; gap:6px; height:34px; padding:0 14px; border-radius:9px; cursor:pointer;
  font-size:12.5px; font-weight:600; border:0; background:var(--zs-grad); color:#fff; text-decoration:none; font-family:inherit;
  box-shadow:0 6px 16px -8px rgba(5,109,232,.6), inset 0 1px 0 rgba(255,255,255,.2); transition:transform .16s var(--zs-ease), opacity .16s; }
.zs-btn:hover:not([disabled]) { transform:translateY(-1px); }
.zs-btn[disabled] { opacity:.45; box-shadow:none; cursor:default; }
.zs-logs { margin-top:12px; padding:10px 12px; border-radius:10px; background:var(--zs-sunken);
  font-family:var(--ds-font-family-code,ui-monospace,Menlo,monospace); font-size:11.5px; line-height:1.7; color:var(--zs-ink-2); max-height:160px; overflow:auto; }
@media (max-width: 560px) {
  .zs-onb { padding:48px 18px 56px; }
  .zs-onb h1 { font-size:26px; }
  .zs-onb-step { padding:16px; gap:12px; }
  .zs-onb-form { flex-direction:column; }
  .zs-onb-form .zs-btn { width:100%; }
}

/* ---------- Skeleton ---------- */
.zs-sk { border-radius:6px; background:linear-gradient(90deg, var(--zs-skel) 0%, var(--zs-brand-soft) 50%, var(--zs-skel) 100%);
  background-size:200% 100%; animation:zs-shimmer 1.6s linear infinite; }
@keyframes zs-shimmer { 0% { background-position:100% 0 } 100% { background-position:-100% 0 } }
.zs-sk-line { height:11px; margin:12px 0; }
.zs-sk-row { display:flex; align-items:center; gap:9px; }
.zs-sk-dot { width:26px; height:26px; border-radius:8px; flex:none; }

@media (max-width: 860px) {
  .zs-body { flex-direction:column; overflow:auto; }
  .zs-left { width:auto; max-width:none; min-width:0; overflow:visible; border-right:0; border-bottom:.5px solid var(--zs-line-2); }
  .zs-right { overflow:visible; }
  .zs-plugins { padding:20px 16px 40px; }
  .zs-plugin-grid { grid-template-columns:1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .zs-root *, .zs-root *::before, .zs-root *::after { animation-duration:.001ms !important; animation-iteration-count:1 !important; transition-duration:.001ms !important; }
}
`

    const INLINE_PATTERN = /(\u0000BR\u0000|\\[\\`*_{}\[\]()#+\-.!>~|]|`[^`\n]+`|!\[[^\]]*\]\([^)]*\)|\[[^\]]+\]\([^)]*\)|\[\d{1,3}\]|<(?:https?:\/\/|mailto:)[^>\s]+>|\*\*\*[^*\n]+?\*\*\*|\*\*[^*\n]+?\*\*|__[^_\n]+?__|~~[^~\n]+?~~|(?<![*\w])\*(?!\s)[^*\n]+?(?<!\s)\*(?!\*)|(?<![_\w])_(?!\s)[^_\n]+?(?<!\s)_(?![\w])|\bhttps?:\/\/[^\s<>()]+)/g

    function safeUrl(value, image = false) {
      const url = String(value ?? '').trim()
      if (/^https?:\/\//i.test(url)) return url
      if (!image && (/^mailto:/i.test(url) || url.startsWith('/') || url.startsWith('#'))) return url
      return ''
    }

    function splitDestination(raw) {
      const value = String(raw ?? '').trim()
      const match = value.match(/^(\S+?)(?:\s+"([^"]*)")?$/)
      return match ? { url: match[1], title: match[2] ?? '' } : { url: value, title: '' }
    }

    function renderCite(n, cards, cite, onCite, key) {
      const id = Number(n)
      const resolvedIndex = cite?.map?.[id]
      if (Number.isInteger(resolvedIndex)) {
        const card = cards?.[resolvedIndex]
        return h('sup', {
          key,
          className: 'zs-cite',
          role: 'button',
          tabIndex: 0,
          title: card ? `${card.source === 'web' ? card.host : card.author}：${card.title}` : `来源 ${resolvedIndex + 1}`,
          onClick: () => {
            if (onCite) onCite(resolvedIndex)
            else if (card?.url) window.open(card.url, '_blank', 'noopener,noreferrer')
          },
          onKeyDown: (e) => { if (e.key === 'Enter' && onCite) onCite(resolvedIndex) },
        }, String(resolvedIndex + 1))
      }
      if (cite?.final) {
        return h('sup', { key, className: 'zs-cite missing', title: '未找到对应来源' }, String(id))
      }
      return h('sup', { key, className: 'zs-cite pending', title: '引用加载中', 'aria-label': '引用加载中' }, '·')
    }

    function renderInline(text, prefix, cards, cite, onCite) {
      const out = []
      // While streaming, an opening ** can arrive before its pair; close it so no raw ** flashes.
      let source = String(text ?? '')
      const pairs = source.match(/\*\*/g)
      if (pairs && pairs.length % 2 === 1) {
        const at = source.lastIndexOf('**')
        source = source.slice(at + 2).trim() ? `${source}**` : source.slice(0, at)
      }
      const pattern = new RegExp(INLINE_PATTERN.source, 'g')
      let last = 0
      let match
      let index = 0
      while ((match = pattern.exec(source)) !== null) {
        if (match.index > last) out.push(source.slice(last, match.index).replace(/\n/g, ' '))
        const token = match[0]
        const key = `${prefix}-${index}`
        if (token === '\u0000BR\u0000') {
          out.push(h('br', { key }))
        } else if (/^\\[\s\S]$/.test(token)) {
          out.push(token.slice(1))
        } else if (/^`[^`\n]+`$/.test(token)) {
          out.push(h('code', { key, className: 'zs-inline-code' }, token.slice(1, -1)))
        } else if (token.startsWith('![')) {
          const parsed = token.match(/^!\[([^\]]*)\]\(([^)]*)\)$/)
          const destination = splitDestination(parsed?.[2])
          const src = safeUrl(destination.url, true)
          out.push(src
            ? h('img', {
              key,
              className: 'zs-img',
              src,
              alt: parsed?.[1] ?? '',
              title: destination.title || undefined,
              loading: 'lazy',
              referrerPolicy: 'no-referrer',
            })
            : h('span', { key, className: 'zs-img-fallback' }, parsed?.[1] || destination.url))
        } else if (/^\[[^\]]+\]\([^)]*\)$/.test(token)) {
          const parsed = token.match(/^\[([^\]]+)\]\(([^)]*)\)$/)
          const destination = splitDestination(parsed?.[2])
          const href = safeUrl(destination.url)
          out.push(href
            ? h('a', {
              key,
              href,
              title: destination.title || undefined,
              target: '_blank',
              rel: 'noreferrer',
            }, renderInline(parsed?.[1] ?? '', key, cards, cite, onCite))
            : renderInline(parsed?.[1] ?? '', key, cards, cite, onCite))
        } else if (/^\[\d{1,3}\]$/.test(token)) {
          out.push(renderCite(token.slice(1, -1), cards, cite, onCite, key))
        } else if (token.startsWith('<')) {
          const href = safeUrl(token.slice(1, -1))
          out.push(href
            ? h('a', { key, href, target: '_blank', rel: 'noreferrer' }, token.slice(1, -1))
            : token)
        } else if (token.startsWith('***')) {
          out.push(h('strong', { key }, h('em', null, renderInline(token.slice(3, -3), key, cards, cite, onCite))))
        } else if (token.startsWith('**') || token.startsWith('__')) {
          out.push(h('strong', { key }, renderInline(token.slice(2, -2), key, cards, cite, onCite)))
        } else if (token.startsWith('~~')) {
          out.push(h('del', { key }, renderInline(token.slice(2, -2), key, cards, cite, onCite)))
        } else if (token.startsWith('*') || token.startsWith('_')) {
          out.push(h('em', { key }, renderInline(token.slice(1, -1), key, cards, cite, onCite)))
        } else {
          const trimmed = token.replace(/[.,;:!?、。；：！？]+$/, '')
          const suffix = token.slice(trimmed.length)
          out.push(h('a', { key, href: trimmed, target: '_blank', rel: 'noreferrer' }, trimmed))
          if (suffix) out.push(suffix)
        }
        last = match.index + token.length
        index += 1
      }
      if (last < source.length) out.push(source.slice(last).replace(/\n/g, ' '))
      return out
    }

    function isBlank(line) {
      return !line || !line.trim()
    }

    function isFence(line) {
      return /^ {0,3}(`{3,}|~{3,})/.test(line)
    }

    function isHeading(line) {
      return /^ {0,3}#{1,6}\s+/.test(line)
    }

    function isHr(line) {
      return /^ {0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/.test(line)
    }

    function isQuote(line) {
      return /^ {0,3}>/.test(line)
    }

    function isListLine(line) {
      return /^(\s*)([-+*]|\d{1,9}[.)])\s+/.test(line)
    }

    function splitRow(line) {
      return line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/)
        .map((cell) => cell.trim().replace(/\\\|/g, '|'))
    }

    function isTableDelimiter(line) {
      return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)
    }

    function isTableStart(lines, index) {
      return lines[index]?.includes('|') && isTableDelimiter(lines[index + 1] ?? '')
    }

    function codeBlockNode(code, lang, key) {
      return h('div', { className: 'zs-codeblock', key },
        h('div', { className: 'zs-codehead' },
          h('span', null, lang || 'code'),
          h('button', {
            className: 'zs-codecopy',
            type: 'button',
            onClick: () => {
              try { navigator.clipboard?.writeText(code) } catch { /* ignore */ }
            },
          }, '复制')),
        h('pre', null, h('code', { className: lang ? `language-${lang}` : undefined }, code)))
    }

    function stripIndent(line, count) {
      let i = 0
      while (i < count && i < line.length && (line[i] === ' ' || line[i] === '\t')) i += 1
      return line.slice(i)
    }

    function parseBlocks(lines, env, depth = 0, keyBase = 'b') {
      const nodes = []
      let i = 0
      while (i < lines.length) {
        if (isBlank(lines[i])) { i += 1; continue }
        const line = lines[i]
        const key = `${keyBase}-${nodes.length}`

        if (isFence(line)) {
          const match = line.match(/^ {0,3}(`{3,}|~{3,})\s*(.*)$/)
          const marker = match[1][0]
          const size = match[1].length
          const lang = (match[2].trim().split(/\s+/)[0] ?? '').toLowerCase()
          const close = new RegExp(`^ {0,3}${marker}{${size},}\\s*$`)
          const body = []
          let j = i + 1
          while (j < lines.length && !close.test(lines[j])) { body.push(lines[j]); j += 1 }
          nodes.push(codeBlockNode(body.join('\n'), lang, key))
          i = j < lines.length ? j + 1 : j
          continue
        }

        if (isHeading(line)) {
          const match = line.match(/^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/)
          const level = Math.min(6, match[1].length)
          nodes.push(h(`h${level}`, { key }, renderInline(match[2] ?? '', key, env.cards, env.cite, env.onCite)))
          i += 1
          continue
        }

        if (isHr(line)) {
          nodes.push(h('hr', { key }))
          i += 1
          continue
        }

        if (isQuote(line)) {
          const body = []
          let j = i
          while (j < lines.length && isQuote(lines[j])) {
            body.push(lines[j].replace(/^ {0,3}>\s?/, ''))
            j += 1
          }
          nodes.push(h('blockquote', { key }, parseBlocks(body, env, depth + 1, `${key}-q`)))
          i = j
          continue
        }

        if (isListLine(line)) {
          const parsed = parseList(lines, i, env, depth, key)
          nodes.push(parsed.node)
          i = parsed.next
          continue
        }

        if (isTableStart(lines, i)) {
          const header = splitRow(line)
          const aligns = splitRow(lines[i + 1]).map((cell) => {
            if (/^:.*:$/.test(cell)) return 'center'
            if (/^:/.test(cell)) return 'left'
            if (/:$/.test(cell)) return 'right'
            return null
          })
          const rows = []
          let j = i + 2
          while (j < lines.length && lines[j].includes('|') && !isBlank(lines[j])) {
            rows.push(splitRow(lines[j]))
            j += 1
          }
          nodes.push(h('div', { className: 'zs-table', key },
            h('table', null,
              h('thead', null, h('tr', null, header.map((cell, c) => h('th', {
                key: c,
                style: aligns[c] ? { textAlign: aligns[c] } : undefined,
              }, renderInline(cell, `${key}-h${c}`, env.cards, env.cite, env.onCite))))),
              h('tbody', null, rows.map((row, r) => h('tr', { key: r },
                header.map((_, c) => h('td', {
                  key: c,
                  style: aligns[c] ? { textAlign: aligns[c] } : undefined,
                }, renderInline(row[c] ?? '', `${key}-${r}-${c}`, env.cards, env.cite, env.onCite)))))))))
          i = j
          continue
        }

        if (/^ {4}/.test(line)) {
          const body = []
          let j = i
          while (j < lines.length && (isBlank(lines[j]) || /^ {4}/.test(lines[j]))) {
            body.push(lines[j].replace(/^ {4}/, ''))
            j += 1
          }
          nodes.push(codeBlockNode(body.join('\n'), '', key))
          i = j
          continue
        }

        if (!isHr(line) && i + 1 < lines.length && /^ {0,3}(=+|-+)\s*$/.test(lines[i + 1])) {
          const level = lines[i + 1].trim().startsWith('=') ? 1 : 2
          nodes.push(h(`h${level}`, { key }, renderInline(line, key, env.cards, env.cite, env.onCite)))
          i += 2
          continue
        }

        const paragraph = []
        let j = i
        while (j < lines.length && !isBlank(lines[j])) {
          if (j > i && (isFence(lines[j]) || isHeading(lines[j]) || isHr(lines[j]) || isQuote(lines[j]) ||
            isListLine(lines[j]) || isTableStart(lines, j))) break
          paragraph.push(lines[j])
          j += 1
        }
        const text = paragraph.map((row, idx) => {
          if (idx < paragraph.length - 1 && /(?: {2,}|\\)$/.test(row)) {
            return `${row.replace(/(?: {2,}|\\)$/, '')}\u0000BR\u0000`
          }
          return row
        }).join('\n')
        nodes.push(h('p', { key }, renderInline(text, key, env.cards, env.cite, env.onCite)))
        i = j
      }
      return nodes
    }

    function elementChildren(node) {
      const children = node?.props?.children
      if (children === undefined || children === null) return []
      return Array.isArray(children) ? children : [children]
    }

    function parseList(lines, start, env, depth, key) {
      const first = lines[start].match(/^(\s*)([-+*]|\d{1,9}[.)])\s+(.*)$/)
      const baseIndent = first[1].replace(/\t/g, '    ').length
      const ordered = /^\d/.test(first[2])
      const startNumber = ordered ? parseInt(first[2], 10) : 1
      const items = []
      let i = start
      while (i < lines.length) {
        const match = lines[i].match(/^(\s*)([-+*]|\d{1,9}[.)])\s+(.*)$/)
        if (!match) break
        if (match[1].replace(/\t/g, '    ').length !== baseIndent) break
        const contentIndent = match[0].indexOf(match[3])
        const itemLines = [match[3]]
        let j = i + 1
        while (j < lines.length) {
          const raw = lines[j]
          if (isBlank(raw)) {
            let k = j + 1
            while (k < lines.length && isBlank(lines[k])) k += 1
            if (k >= lines.length) { j = k; break }
            const next = lines[k].match(/^(\s*)([-+*]|\d{1,9}[.)])\s+/)
            if (next && next[1].replace(/\t/g, '    ').length === baseIndent) { j = k; break }
            const nextIndent = (lines[k].match(/^\s*/)?.[0] ?? '').replace(/\t/g, '    ').length
            if (nextIndent > baseIndent) { itemLines.push(''); j += 1; continue }
            break
          }
          const next = raw.match(/^(\s*)([-+*]|\d{1,9}[.)])\s+/)
          if (next) {
            const indent = next[1].replace(/\t/g, '    ').length
            if (indent === baseIndent) break
          }
          const leading = (raw.match(/^\s*/)?.[0] ?? '').replace(/\t/g, '    ').length
          if (leading > baseIndent) {
            itemLines.push(stripIndent(raw, Math.min(contentIndent, leading)))
            j += 1
            continue
          }
          if (isFence(raw) || isHeading(raw) || isHr(raw) || isQuote(raw) || isTableStart(lines, j)) break
          itemLines.push(raw)
          j += 1
        }
        items.push(itemLines)
        i = j
      }

      const itemNodes = items.map((itemLines, index) => {
        let task = null
        const taskMatch = itemLines[0]?.match(/^\[([ xX])\]\s+(.*)$/)
        if (taskMatch) {
          task = taskMatch[1].toLowerCase() === 'x'
          itemLines = [taskMatch[2], ...itemLines.slice(1)]
        }
        const blocks = parseBlocks(itemLines, env, depth + 1, `${key}-i${index}`)
        const inline = blocks.length === 1 && blocks[0]?.type === 'p' ? elementChildren(blocks[0]) : blocks
        const taskBox = task === null ? null : h('input', {
          type: 'checkbox',
          className: 'zs-task',
          defaultChecked: task,
          disabled: true,
        })
        return h('li', { key: index, className: task === null ? undefined : 'zs-task-item' }, taskBox, inline)
      })

      return {
        node: h(ordered ? 'ol' : 'ul', {
          key,
          ...(ordered && startNumber !== 1 ? { start: startNumber } : {}),
        }, itemNodes),
        next: i,
      }
    }

    function renderAnswer(text, cards, cite, onCite) {
      const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n')
      return parseBlocks(lines, { cards, cite, onCite }, 0, 'ans')
    }

    function Avatar({ item }) {
      const [broken, setBroken] = useState(false)
      const initial = (item.author ?? '?').trim().slice(0, 1).toUpperCase()
      if (item.avatar && !broken) {
        return h('img', {
          className: 'zs-avatar', alt: '', loading: 'lazy', referrerPolicy: 'no-referrer',
          src: `/zsearch/avatar?u=${encodeURIComponent(item.avatar)}`,
          onError: () => setBroken(true),
        })
      }
      return h('span', { className: 'zs-avatar' }, initial)
    }

    function Card({ item, index, fresh, flash }) {
      const ref = useRef(null)
      useEffect(() => { if (flash && ref.current?.scrollIntoView) ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [flash])
      const open = () => { if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer') }
      const meta = item.source === 'web'
        ? (item.host || '网页')
        : ([item.votes ? `${item.votes} 人赞同` : null, item.comments ? `${item.comments} 条评论` : null].filter(Boolean).join(' · ') || '暂无互动数据')
      return h('article', {
        ref, className: `zs-quote${fresh ? ' zs-float' : ''}${flash ? ' flash' : ''}`, onClick: open, title: item.url,
        tabIndex: 0, role: 'link',
        onKeyDown: (e) => { if (e.key === 'Enter') open() },
      },
        h('div', { className: 'zs-qbody' },
          h('span', { className: 'zs-mark', 'aria-hidden': true }, '“'),
          h('span', { className: 'zs-idx' }, String(index + 1)),
          h('p', { className: 'zs-qtext' }, item.quote || item.text || '（无摘要）'),
        ),
        item.source === 'web'
          ? null
          : h('div', { className: 'zs-qauthor' },
            h(Avatar, { item }),
            h('div', { style: { minWidth: 0 } },
              h('div', { className: 'zs-aname' }, item.author),
              h('div', { className: 'zs-abadge' }, [item.type, item.authorTag].filter(Boolean).join(' · ')),
            ),
            h('span', { className: 'zs-zlogo' }, '知乎'),
          ),
        h('div', { className: 'zs-qfoot' },
          h('div', { style: { minWidth: 0 } },
            h('div', { className: 'zs-fq' }, item.title || '相关结果'),
            h('div', { className: 'zs-fmeta' }, meta),
          ),
          h('span', { className: 'zs-arrow', 'aria-hidden': true }, '↗'),
        ),
      )
    }

    function GhostCard({ i }) {
      return h('div', { className: 'zs-ghost', style: { opacity: 1 - i * 0.18 } },
        h('div', { className: 'zs-sk-row' },
          h('div', { className: 'zs-sk zs-sk-dot' }),
          h('div', { style: { flex: 1 } },
            h('div', { className: 'zs-sk zs-sk-line', style: { width: '42%', margin: '0 0 7px' } }),
            h('div', { className: 'zs-sk zs-sk-line', style: { width: '26%', height: 8, margin: 0 } }))),
        h('div', { className: 'zs-sk zs-sk-line', style: { width: '94%', marginTop: 16 } }),
        h('div', { className: 'zs-sk zs-sk-line', style: { width: '86%' } }),
        h('div', { className: 'zs-sk zs-sk-line', style: { width: i % 2 ? '58%' : '70%' } }))
    }

    function split(cards, count = 2) {
      const cols = Array.from({ length: count }, () => [])
      const heights = cols.map(() => 0)
      cards.forEach((card, index) => {
        const chars = (card.quote || card.text || '').length
        const lines = Math.max(1, Math.min(6, Math.ceil(chars / 18)))
        const height = 22 + 14 + lines * 25 + 16 + (card.source === 'web' ? 0 : 48) + 52
        const target = heights.indexOf(Math.min(...heights))
        cols[target].push({ card, index })
        heights[target] += height
      })
      return cols
    }

    function Setup({ status, onDone, onRefresh }) {
      const cliReady = Boolean(status?.cli?.found)
      const authReady = Boolean(status?.auth?.configured)
      const [installing, setInstalling] = useState(false)
      const [logs, setLogs] = useState([])
      const [secret, setSecret] = useState('')
      const [busy, setBusy] = useState(false)
      const [message, setMessage] = useState(null)
      const [editingSecret, setEditingSecret] = useState(false)

      const install = () => {
        if (installing) return
        setInstalling(true)
        setLogs([])
        setMessage(null)
        const source = new EventSource('/zsearch/api/setup/install')
        source.addEventListener('step', (event) => {
          const data = JSON.parse(event.data)
          setLogs((list) => [...list, data.message])
        })
        source.addEventListener('done', () => {
          source.close()
          setInstalling(false)
          setMessage('CLI 已更新，正在重新检测…')
          onRefresh?.()
        })
        source.addEventListener('failure', (event) => {
          source.close()
          setInstalling(false)
          setMessage(JSON.parse(event.data).message)
        })
        source.onerror = () => {
          source.close()
          setInstalling(false)
          setMessage('安装流中断，请重试')
        }
      }

      const submit = async () => {
        if (busy || !secret.trim()) return
        setBusy(true)
        setMessage(null)
        try {
          const response = await fetch('/zsearch/api/setup/secret', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ secret: secret.trim() }),
          })
          const body = await response.json().catch(() => ({}))
          if (!body.ok) throw new Error(body.message || '配置失败')
          setSecret('')
          setEditingSecret(false)
          setMessage(`已保存 ${body.masked ?? ''}`)
          onRefresh?.()
        } catch (error) {
          setMessage(String(error?.message ?? error))
        } finally {
          setBusy(false)
        }
      }

      const allReady = cliReady && authReady
      const doneCount = Number(cliReady) + Number(authReady) + Number(allReady)
      const stepState = (done, available) => (done ? 'done' : available ? 'active' : 'pending')
      const showSecretForm = !authReady || editingSecret

      const step = (n, state, title, pill, desc, actions, side) => h('section', { className: `zs-onb-step ${state}` },
        h('div', { className: `zs-onb-num ${state}` }, state === 'done' ? h(Icon, { name: 'check', size: 13, stroke: 2.6 }) : String(n).padStart(2, '0')),
        h('div', { className: 'zs-onb-main' },
          h('div', { className: 'zs-onb-row' },
            h('h2', { className: 'zs-onb-title' }, title),
            h('span', { className: `zs-onb-pill${state === 'done' ? ' done' : ''}` }, pill),
            side ? h('div', { className: 'zs-onb-side' }, side) : null),
          h('p', { className: 'zs-onb-desc' }, desc),
          actions ? h('div', { className: 'zs-onb-actions' }, actions) : null))

      return h('div', { className: 'zs-setup-wrap zs-scroll' },
        h('div', { className: 'zs-aura', 'aria-hidden': true }),
        h('div', { className: 'zs-onb' },
          h('header', { className: 'zs-onb-head' },
            h('div', { className: 'zs-onb-eyebrow' },
              h('span', { className: 'zs-onb-dot' }),
              allReady ? 'ZSearch · 已就绪' : 'ZSearch · 首次设置'),
            h('h1', null, allReady ? '都接上了，开始问吧' : '把知乎检索接上')),
          h('div', { className: 'zs-onb-progress' },
            h('span', null, allReady ? '全部就绪' : `${doneCount} / 3 已完成`),
            h('div', { className: 'zs-onb-track', 'aria-hidden': true },
              h('i', { style: { width: `${(doneCount / 3) * 100}%` } }))),
          h('div', { className: 'zs-onb-card' },
            step(1, stepState(cliReady, true), '安装知乎 CLI',
              cliReady ? '已就绪' : '待安装',
              cliReady
                ? `本机已安装 ${status?.cli?.version ?? ''}。需要时可以在右侧重新安装。`
                : '下载官方 Skill 包，校验 SHA-256 后由官方脚本安装。',
              cliReady
                ? (logs.length ? h('div', { className: 'zs-onb-logs zs-logs zs-scroll' }, logs.map((line, i) => h('div', { key: i }, `› ${line}`))) : null)
                : h(React.Fragment, null,
                  h('button', { className: 'zs-btn', type: 'button', onClick: install, disabled: installing },
                    installing ? h('span', { className: 'zs-spin', style: { borderColor: 'rgba(255,255,255,.35)', borderTopColor: '#fff' } }) : null,
                    installing ? '安装中…' : '安装 CLI'),
                  logs.length ? h('div', { className: 'zs-onb-logs zs-logs zs-scroll' }, logs.map((line, i) => h('div', { key: i }, `› ${line}`))) : null),
              cliReady
                ? h('button', { className: 'zs-onb-text', type: 'button', onClick: install, disabled: installing },
                  installing ? '安装中…' : '重新安装')
                : null),
            step(2, stepState(authReady, cliReady), '配置 Access Secret',
              authReady ? '已配置' : '待配置',
              authReady && !editingSecret
                ? `本机已保存 ${status?.auth?.masked ?? ''}，只写入系统钥匙串。`
                : '在知乎开放平台个人中心申请 Access Secret，然后粘贴到这里。',
              showSecretForm
                ? h(React.Fragment, null,
                  h('div', { className: 'zs-onb-form' },
                    h('input', {
                      className: 'zs-field', type: 'password', placeholder: '粘贴 Access Secret', value: secret,
                      autoComplete: 'off', onChange: (e) => setSecret(e.target.value),
                      onKeyDown: (e) => { if (e.key === 'Enter') submit() },
                    }),
                    h('button', { className: 'zs-btn', type: 'button', onClick: submit, disabled: busy || !secret.trim() },
                      busy ? '保存中…' : '保存')),
                  h('div', { className: 'zs-onb-actions' },
                    h('a', { className: 'zs-onb-hint', href: 'https://developer.zhihu.com/profile', target: '_blank', rel: 'noreferrer' },
                      '去开放平台申请', h(Icon, { name: 'out', size: 11 })),
                    authReady
                      ? h('button', { className: 'zs-onb-text', type: 'button', onClick: () => { setEditingSecret(false); setSecret(''); setMessage(null) } }, '取消')
                      : null))
                : null,
              authReady && !editingSecret
                ? h('button', { className: 'zs-onb-text', type: 'button', onClick: () => setEditingSecret(true) }, '更新 Secret')
                : null),
            step(3, stepState(allReady, allReady), '开始使用',
              allReady ? '可以开始' : '等待前置',
              allReady
                ? '都准备好了。现在提问，左右两栏会一起开始工作。'
                : '完成上面两步后，这里会出现开始按钮。',
              allReady
                ? h('button', { className: 'zs-btn', type: 'button', onClick: onDone },
                  '开始搜索', h(Icon, { name: 'arrowUp', size: 14, stroke: 2.2 }))
                : null)),
          message ? h('div', { className: 'zs-onb-msg' }, message) : null,
          h('div', { className: 'zs-onb-foot' },
            h(Icon, { name: 'info', size: 12 }),
            h('span', null, 'Secret 只写入系统钥匙串，不进入仓库、日志或聊天记录。')),
        ),
      )
    }

    function Home({ onSearch, setup, ready, onOpenSetup, onOpenPlugins }) {
      const [value, setValue] = useState('')
      const examples = ['DSH 插件怎么安装', 'DeepSeek Harness 和 Cursor 怎么选', 'billion-context 值得装吗']
      const submit = () => { if (value.trim()) onSearch(value.trim()) }
      return h('div', { className: 'zs-hero zs-scroll' },
        h('div', { className: 'zs-dragstrip', 'aria-hidden': true }),
        h('div', { className: 'zs-aura', 'aria-hidden': true }),
        h('div', { className: 'zs-slogan zs-in d1' }, '问知乎，查全网'),
        setup && !ready
          ? h('div', { className: 'zs-banner zs-in d2' },
            h(Icon, { name: 'info', size: 15 }),
            h('span', null, '知乎检索尚未启用，先完成两步配置'),
            onOpenSetup ? h('button', { type: 'button', onClick: onOpenSetup }, '去配置') : null)
          : null,
        h('div', { className: 'zs-composer zs-in d3' },
          h('div', { className: 'zs-box' },
            h('input', {
              className: 'zs-input', placeholder: '问点什么，知乎和全网一起找答案…', value, autoFocus: true,
              onChange: (e) => setValue(e.target.value),
              onKeyDown: (e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit() },
            }),
            h('button', { className: 'zs-submit', type: 'button', onClick: submit, disabled: !value.trim(), 'aria-label': '搜索' },
              h(Icon, { name: 'arrowUp', size: 17, stroke: 2.3 })),
          ),
        ),
        h('div', { className: 'zs-chips zs-in d4' }, examples.map((text) => h('button', {
          key: text, className: 'zs-chip', type: 'button', onClick: () => onSearch(text),
        }, h(Icon, { name: 'search', size: 13 }), text))),
        h('div', { className: 'zs-topics zs-in d4' },
          h('span', { className: 'zs-topics-label' }, '专题'),
          h('button', { className: 'zs-topic-entry', type: 'button', onClick: onOpenPlugins },
            h('span', { className: 'zs-topic-entry-ico' }, h(Icon, { name: 'spark', size: 16 })),
            h('span', { className: 'zs-topic-entry-main' },
              h('span', { className: 'zs-topic-entry-title' }, '热门插件'),
              h('span', { className: 'zs-topic-entry-desc' }, '按 GitHub Star 排序 · AI 评价 + 社区讨论')),
            h(Icon, { name: 'out', size: 14 }))),
      )
    }

    function InstallDialog({ state, plugin, onClose, onConfirm, onApprove }) {
      if (!state) return null
      const stage = state.stage
      const pending = Array.isArray(state.result?.pendingBuilds) ? state.result.pendingBuilds : []
      const title = stage === 'done'
        ? '安装完成'
        : stage === 'error'
          ? '无法安装'
          : stage === 'installing'
            ? '正在安装'
            : '安装这个插件？'
      return h('div', { className: 'zs-install-backdrop', role: 'presentation', onClick: onClose },
        h('section', {
          className: 'zs-install-dialog', role: 'dialog', 'aria-label': title,
          onClick: (event) => event.stopPropagation(),
        },
          h('div', { className: 'zs-install-head' },
            h('h2', null, title),
            h('button', { className: 'zs-install-close', type: 'button', onClick: onClose, 'aria-label': '关闭' }, '×')),
          stage === 'loading'
            ? h('p', { className: 'zs-install-text' }, '正在检查插件来源…')
            : stage === 'installing'
              ? h('p', { className: 'zs-install-text' }, '正在安装，pnpm 可能在拉包，请稍等…')
              : stage === 'error'
                ? h('p', { className: 'zs-install-error' }, state.message || '安装失败')
                : stage === 'done'
                  ? h('div', null,
                    h('p', { className: 'zs-install-text' },
                      state.result?.application === 'restart-required'
                        ? '已安装，需要重启 DSH 才会生效。'
                        : '已安装并激活。如果界面没变化，刷新一下页面。'),
                    pending.length
                      ? h('p', { className: 'zs-install-warn' }, `该插件有 ${pending.length} 个安装脚本被拦下：${pending.join('、')}。允许后才会执行。`)
                      : null)
                  : h('div', null,
                    h('p', { className: 'zs-install-text' }, `将 ${plugin.name} 安装到当前 DSH Profile。`),
                    h('code', { className: 'zs-install-code' }, state.spec || plugin.install || plugin.name),
                    h('p', { className: 'zs-install-warn' }, '安装会把第三方代码装进当前 Profile，并可能要求重启。只安装你信任的插件；插件声明的能力由它自己使用。')),
          h('div', { className: 'zs-install-actions' },
            stage === 'confirm'
              ? [h('button', { key: 'cancel', className: 'zs-install-btn', type: 'button', onClick: onClose }, '取消'),
                h('button', { key: 'ok', className: 'zs-install-btn primary', type: 'button', onClick: onConfirm }, '确认安装')]
              : stage === 'done' && pending.length
                ? [h('button', { key: 'close', className: 'zs-install-btn', type: 'button', onClick: onClose }, '稍后'),
                  h('button', { key: 'approve', className: 'zs-install-btn primary', type: 'button', onClick: () => onApprove(pending) }, '允许并重试')]
                : h('button', { className: 'zs-install-btn primary', type: 'button', onClick: onClose }, '关闭')),
        ))
    }

    function PluginCard({ plugin }) {
      const [install, setInstall] = useState(null)
      const spec = plugin.npm || plugin.repo || null

      const startInstall = async () => {
        if (!spec || install) return
        setInstall({ stage: 'loading', spec })
        try {
          const response = await fetch(`/zsearch/api/plugins/install/inspect?pluginId=${encodeURIComponent(plugin.id)}`)
          const body = await response.json()
          if (!body.ok) {
            setInstall({ stage: 'error', spec, message: body.result?.reason ?? body.message ?? body.code ?? '检查失败' })
            return
          }
          setInstall({ stage: 'confirm', spec, info: body.result })
        } catch (error) {
          setInstall({ stage: 'error', spec, message: String(error?.message ?? error) })
        }
      }

      const confirmInstall = async (approvedBuilds) => {
        setInstall((prev) => ({ ...(prev ?? {}), stage: 'installing', spec }))
        try {
          const response = await fetch('/zsearch/api/plugins/install', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ pluginId: plugin.id, approvedBuilds }),
          })
          const body = await response.json()
          if (!body.ok) {
            setInstall((prev) => ({ ...(prev ?? {}), stage: 'error', message: body.error?.diagnostic ?? body.message ?? body.code ?? '安装失败' }))
            return
          }
          setInstall((prev) => ({ ...(prev ?? {}), stage: 'done', result: body }))
        } catch (error) {
          setInstall((prev) => ({ ...(prev ?? {}), stage: 'error', message: String(error?.message ?? error) }))
        }
      }

      return h('section', { className: 'zs-plugin-card' },
        h('div', { className: 'zs-plugin-eyebrow' }, '插件评测'),
        h('h1', { className: 'zs-plugin-name' }, plugin.name),
        h('div', { className: 'zs-plugin-meta' },
          h('span', null, plugin.category || '未分类'),
          h('span', null, `★ ${fmtCount(plugin.stars)}`),
          h('span', null, `↓ ${fmtCount(plugin.downloads)}/月`)),
        h('p', { className: 'zs-plugin-desc' }, plugin.desc || '暂无简介'),
        h('div', { className: 'zs-plugin-actions' },
          plugin.repo
            ? h('a', { className: 'zs-plugin-link', href: plugin.repo, target: '_blank', rel: 'noreferrer' },
              'GitHub', h(Icon, { name: 'out', size: 12 }))
            : null,
          h('button', {
            className: 'zs-plugin-install', type: 'button', onClick: startInstall,
            disabled: !spec || Boolean(install && install.stage !== 'done' && install.stage !== 'error'),
          }, '安装到当前 Profile')),
        plugin.install ? h('code', { className: 'zs-plugin-code' }, plugin.install) : null,
        install
          ? h(InstallDialog, {
            state: install,
            plugin,
            onClose: () => setInstall(null),
            onConfirm: () => confirmInstall(undefined),
            onApprove: (pending) => confirmInstall(pending),
          })
          : null,
      )
    }

    function Results({ query, runId, onSearch, onHome, onBack, backLabel = '返回首页', setup, ready, showStats = true, onOpenSetup, plugin = null, pluginId = null, persist = true }) {
      const saved = persist ? panelState : null
      const restored = saved && saved.view === 'results' && saved.query === query &&
        (saved.attempt ?? 0) === runId && saved.started === true && panelHasContent(saved)
        ? saved
        : null
      const [value, setValue] = useState(plugin ? '' : query)
      const [cards, setCards] = useState(() => (Array.isArray(restored?.cards) ? restored.cards : []))
      const [answer, setAnswer] = useState(typeof restored?.answer === 'string' ? restored.answer : '')
      const [plan, setPlan] = useState(restored?.plan ?? null)
      const [error, setError] = useState(typeof restored?.error === 'string' ? restored.error : null)
      const [running, setRunning] = useState(!restored)
      const [interrupted, setInterrupted] = useState(Boolean(restored && (restored.phase === 'running' || restored.interrupted === true)))
      const [flash, setFlash] = useState(null)
      const [copied, setCopied] = useState(false)
      const [citationMap, setCitationMap] = useState(() => (restored?.citationMap && typeof restored.citationMap === 'object' ? restored.citationMap : {}))
      const [citationsFinal, setCitationsFinal] = useState(restored?.citationsFinal === true)
      const [answerStatus, setAnswerStatus] = useState(restored?.answerStatus ?? null)
      const latestRef = useRef(null)

      useEffect(() => {
        const current = persist ? panelState : null
        if (persist && current && current.view === 'home') return undefined
        if (persist && current && (current.attempt ?? 0) !== runId) return undefined
        const canRestore = persist && current && current.view === 'results' && current.query === query &&
          current.started === true && panelHasContent(current)
        if (canRestore) {
          setValue(query)
          setCards(Array.isArray(current.cards) ? current.cards : [])
          setAnswer(typeof current.answer === 'string' ? current.answer : '')
          setPlan(current.plan ?? null)
          setError(typeof current.error === 'string' ? current.error : null)
          setCitationMap(current.citationMap && typeof current.citationMap === 'object' ? current.citationMap : {})
          setCitationsFinal(current.citationsFinal === true)
          setAnswerStatus(current.answerStatus ?? null)
          setRunning(false)
          setInterrupted(current.phase === 'running' || current.interrupted === true)
          return undefined
        }
        let closed = false
        setValue(plugin ? '' : query)
        setCards([])
        setAnswer('')
        setPlan(null)
        setError(null)
        setRunning(true)
        setInterrupted(false)
        setFlash(null)
        setCopied(false)
        setCitationMap({})
        setCitationsFinal(false)
        setAnswerStatus(null)
        if (persist) {
          updatePanel({
            query,
            attempt: runId,
            started: true,
            phase: 'running',
            cards: [],
            answer: '',
            plan: null,
            error: null,
            interrupted: false,
          })
        }
        const refresh = settings.forceRefresh ? '&refresh=1' : ''
        const pluginMode = pluginId ? `&mode=plugin&pluginId=${encodeURIComponent(pluginId)}` : ''
        const source = new EventSource(`/zsearch/api/stream?q=${encodeURIComponent(query)}${pluginMode}${refresh}`)
        const parse = (event) => JSON.parse(event.data)
        source.addEventListener('plan', (event) => { if (!closed) setPlan(parse(event)) })
        source.addEventListener('topic', (event) => {
          if (closed) return
          const data = parse(event)
          setPlan((current) => ({ ...(current ?? {}), topic: data.topic ?? '', source: data.source ?? current?.source }))
        })
        source.addEventListener('answer-status', (event) => {
          if (closed) return
          setAnswerStatus(parse(event))
        })
        source.addEventListener('citations', (event) => {
          if (closed) return
          const data = parse(event)
          setCitationMap(data.map && typeof data.map === 'object' ? data.map : {})
          setCitationsFinal(true)
        })
        source.addEventListener('card', (event) => { if (!closed) setCards((list) => [...list, parse(event)]) })
        source.addEventListener('answer', (event) => { if (!closed) setAnswer((text) => text + parse(event).t) })
        source.addEventListener('done', (event) => {
          if (closed) return
          const data = parse(event)
          if (data.answer) {
            setAnswerStatus(data.answer.finish && data.answer.finish !== 'stop' ? data.answer : null)
          }
          closed = true
          setRunning(false)
          source.close()
        })
        source.addEventListener('failure', (event) => {
          if (closed) return
          closed = true
          setError(parse(event).message)
          setRunning(false)
          source.close()
        })
        source.onerror = () => {
          if (closed) return
          closed = true
          source.close()
          setRunning(false)
          setError('连接中断')
        }
        return () => {
          closed = true
          source.close()
        }
      }, [query, runId, pluginId, persist])

      useEffect(() => {
        if (!flash) return undefined
        const timer = setTimeout(() => setFlash(null), 1600)
        return () => clearTimeout(timer)
      }, [flash])

      useEffect(() => {
        if (!persist) return undefined
        latestRef.current = { query, attempt: runId, cards, answer, plan, error, running, interrupted, citationMap, citationsFinal, answerStatus }
        const timer = setTimeout(() => savePanelResults(latestRef.current), 350)
        return () => clearTimeout(timer)
      }, [cards, answer, plan, error, running, interrupted, query, runId, citationMap, citationsFinal, answerStatus, persist])

      useEffect(() => {
        if (!persist) return undefined
        const flush = () => savePanelResults(latestRef.current)
        window.addEventListener('pagehide', flush)
        return () => {
          window.removeEventListener('pagehide', flush)
          flush()
        }
      }, [persist])

      const derivedMap = useMemo(() => {
        const map = {}
        cards.forEach((card, index) => {
          const id = card?.candidateId
          if (id !== undefined && id !== null && map[id] === undefined) map[id] = index
        })
        return map
      }, [cards])
      const cite = useMemo(() => ({
        map: citationsFinal ? citationMap : derivedMap,
        // A stopped run will not deliver more citation events: unresolved ids are final.
        final: citationsFinal || !running,
      }), [citationsFinal, citationMap, derivedMap, running])

      const rightRef = useRef(null)
      const [colCount, setColCount] = useState(2)
      useEffect(() => {
        const node = rightRef.current
        if (!node || typeof ResizeObserver === 'undefined') return undefined
        const observer = new ResizeObserver(([entry]) => {
          const width = entry.contentRect.width
          setColCount(width < 520 ? 1 : width > 1080 ? 3 : 2)
        })
        observer.observe(node)
        return () => observer.disconnect()
      }, [])
      const columns = useMemo(() => split(cards, colCount), [cards, colCount])
      const groupRefs = useRef([])
      const groups = useMemo(() => {
        const list = []
        const byKey = new Map()
        cards.forEach((card, index) => {
          const item = { ...card, __index: index }
          const key = card.group?.question || card.group?.label || ''
          if (!byKey.has(key)) {
            const group = { label: card.group?.label || '', question: card.group?.question || '', extra: false, items: [] }
            byKey.set(key, group)
            list.push(group)
          }
          if (card.backfill === true) byKey.get(key).extra = true
          byKey.get(key).items.push(item)
        })
        return list
      }, [cards])
      const submit = () => { if (value.trim()) onSearch(value.trim()) }

      const zCount = cards.filter((c) => c.source !== 'web').length
      const wCount = cards.length - zCount
      const extraCount = cards.filter((c) => c.backfill === true).length
      const curatedCount = cards.length - extraCount
      return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
        h('div', { className: 'zs-topbar' },
          h('button', { className: 'zs-back', type: 'button', onClick: onBack ?? onHome, title: backLabel, 'aria-label': backLabel }, h(Icon, { name: 'back', size: 18 })),
          h('div', { className: 'zs-box' },
            h(Icon, { name: 'search', size: 15 }),
            h('input', {
              className: 'zs-input', value, onChange: (e) => setValue(e.target.value),
              placeholder: plugin ? '继续搜索其他问题…' : '',
              onKeyDown: (e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit() },
            }),
            h('button', { className: 'zs-submit', type: 'button', onClick: submit, 'aria-label': '搜索', disabled: !value.trim() },
              h(Icon, { name: 'arrowUp', size: 15, stroke: 2.3 })),
          ),
          showStats
            ? running && !plan
              ? h('div', { className: 'zs-stats live' }, h('span', { className: 'zs-spin' }), '正在检索知乎与全网')
              : plan
                ? h('div', { className: 'zs-stats', title: `候选：知乎 ${plan.zhihu} · 全网 ${plan.web}` },
                  h('span', { className: 'zs-stat' }, h('span', { className: 'zs-dot z' }), '知乎 ', h('b', null, plan.zhihu)),
                  h('span', { className: 'zs-stat' }, h('span', { className: 'zs-dot w' }), '全网 ', h('b', null, plan.web)),
                  h('span', { className: 'zs-stat accent' },
                    extraCount ? `精选 ${curatedCount} · 补充 ${extraCount}` : `采纳 ${curatedCount}`))
                : null
            : null,
          running ? h('div', { className: 'zs-progress', 'aria-hidden': true }) : null,
        ),
        h('div', { className: 'zs-body' },
          h('div', { className: 'zs-left zs-scroll' },
            plugin ? h(PluginCard, { plugin }) : h('h1', { className: 'zs-qtitle' }, query),
            !ready
              ? h('div', { className: 'zs-banner' },
                h(Icon, { name: 'info', size: 15 }),
                h('span', null, '知乎检索未启用'),
                onOpenSetup ? h('button', { type: 'button', onClick: onOpenSetup }, '去配置') : null)
              : null,
            interrupted && !running
              ? h('div', { className: 'zs-banner' },
                h(Icon, { name: 'info', size: 15 }),
                h('span', null, '上次检索中断，已保留返回的内容'),
                h('button', { type: 'button', onClick: submit }, '重新检索'))
              : null,
            error && !answer ? h('div', { className: 'zs-err', role: 'alert' }, h(Icon, { name: 'info', size: 15 }), h('span', null, error)) : null,
            h('div', { className: 'zs-card' },
              !answer && running && ready
                ? h('div', { 'aria-label': '加载中' },
                  h('div', { className: 'zs-sk zs-sk-line', style: { width: '88%' } }),
                  h('div', { className: 'zs-sk zs-sk-line', style: { width: '96%' } }),
                  h('div', { className: 'zs-sk zs-sk-line', style: { width: '72%' } }),
                  h('div', { className: 'zs-sk zs-sk-line', style: { width: '34%', marginTop: 26, height: 13 } }),
                  h('div', { className: 'zs-sk zs-sk-line', style: { width: '90%' } }),
                  h('div', { className: 'zs-sk zs-sk-line', style: { width: '64%' } }))
                : null,
              h('div', { className: 'zs-answer' },
                renderAnswer(answer, cards, cite, (i) => setFlash(i)),
                running && answer ? h('span', { className: 'zs-caret', 'aria-hidden': true }) : null,
              ),
              answerNotice(answerStatus)
                ? h('div', { className: 'zs-warn', role: 'status' },
                  h(Icon, { name: 'info', size: 14 }),
                  h('span', null, answerNotice(answerStatus)))
                : null,
              answer && !running
                ? h('div', { className: 'zs-actions' },
                  h('button', {
                    className: `zs-action${copied ? ' ok' : ''}`, type: 'button', title: '复制回答',
                    onClick: () => {
                      try { navigator.clipboard.writeText(renumberCitations(answer, cite.map)) } catch { /* ignore */ }
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1500)
                    },
                  }, h(Icon, { name: copied ? 'check' : 'copy', size: 14 }), copied ? '已复制' : '复制'),
                  h('button', { className: 'zs-action', type: 'button', title: '重新搜索', onClick: submit }, h(Icon, { name: 'redo', size: 14 }), '重新生成'),
                  h('span', { className: 'zs-actnote' }, '点击角标可定位右侧原文'),
                )
                : null,
            ),
          ),
          h('div', { className: 'zs-right zs-scroll', ref: rightRef },
            plan?.topic && cards.length
              ? h('div', { className: 'zs-topic' },
                h('h3', { className: 'zs-topic-q' }, plan.topic),
                groups.length > 1
                  ? h('div', { className: 'zs-topic-nav' }, groups.map((group, gi) => h('button', {
                    key: gi, type: 'button', className: 'zs-topic-chip',
                    onClick: () => groupRefs.current[gi]?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
                  }, h('b', null, String(gi + 1).padStart(2, '0')), group.label || group.question)))
                  : null)
              : h('div', { className: 'zs-rhead' },
                h('h3', null, plugin ? '社区评价' : '引用证据'),
                h('span', null, cards.length ? `知乎 ${zCount} · 全网 ${wCount}` : running ? (plan ? 'AI 正在按视角筛选…' : '正在检索…') : '')),
            cards.length
              ? groups.map((group, gi) => h('section', {
                key: gi, className: `zs-group${group.question ? '' : ' plain'}${group.extra ? ' extra' : ''}`,
                ref: (node) => { groupRefs.current[gi] = node },
              },
                group.question || group.label
                  ? h('div', { className: 'zs-ghead' },
                    h('span', { className: 'zs-gnum' }, String(gi + 1).padStart(2, '0')),
                    h('div', { className: 'zs-gtext' },
                      h('h4', { className: 'zs-gq' }, group.question || group.label)),
                    h('span', { className: 'zs-gcount' }, `${group.items.length} 条`))
                  : null,
                h('div', { className: 'zs-flow' },
                  split(group.items, Math.min(colCount, Math.max(1, group.items.length))).map((column, ci) => h('div', { className: 'zs-col', key: ci },
                    column.map(({ card }) => h(Card, {
                      key: `${card.url}-${card.__index}`, item: card, index: card.__index, fresh: running && card.__index === cards.length - 1,
                      flash: flash === card.__index,
                    })))))))
              : running
                ? h('div', { className: 'zs-flow' },
                  columns.map((_, ci) => h('div', { className: 'zs-col', key: ci }, [0, 1, 2].map((i) => h(GhostCard, { key: i, i: i + ci * 0.5 })))))
                : h('div', { className: 'zs-state' },
                  h('span', { className: 'zs-state-ico' }, h(Icon, { name: 'quote', size: 20 })),
                  h('b', null, plugin ? '社区里还没有找到直接评价' : '没有找到可用的证据'),
                  plugin ? '可以先看上面的插件资料，或者换个问法。' : '换个说法，或者把问题问得更具体一些。'),
          ),
        ),
      )
    }


    function SettingsPanel({ value, onChange, onClose, setup, onRefreshSetup, onOpenSetup, onClearPanel, onResetSettings }) {
      const [diagnostics, setDiagnostics] = useState(null)
      const [copied, setCopied] = useState(false)

      useEffect(() => {
        let live = true
        fetch('/zsearch/api/diagnostics')
          .then((res) => res.json())
          .then((data) => { if (live) setDiagnostics(data) })
          .catch(() => { if (live) setDiagnostics({ ok: false, items: [] }) })
        return () => { live = false }
      }, [])

      const section = (title, ...children) => h('section', { className: 'zs-set-sec' },
        h('h4', null, title), ...children)
      const row = (title, desc, control) => h('div', { className: 'zs-set-row' },
        h('div', { className: 'zs-set-meta' },
          h('b', null, title),
          desc ? h('span', null, desc) : null),
        control)
      const seg = (key, options) => h('div', { className: 'zs-seg' },
        options.map(([id, label]) => h('button', {
          key: id, type: 'button', className: `zs-seg-btn${value[key] === id ? ' on' : ''}`,
          onClick: () => onChange({ [key]: id }),
        }, label)))
      const toggle = (key, title, desc) => row(title, desc, h('button', {
        type: 'button', className: `zs-switch${value[key] ? ' on' : ''}`,
        'aria-pressed': value[key], 'aria-label': title,
        onClick: () => onChange({ [key]: !value[key] }),
      }, h('span', null)))
      const status = (label, ok, detail) => h('div', { className: 'zs-set-status' },
        h('span', { className: `zs-set-dot${ok ? ' ok' : ''}` }),
        h('b', null, label),
        h('span', null, detail))

      const last = diagnostics?.items?.[0] ?? null
      const copy = async () => {
        try {
          await navigator.clipboard.writeText(JSON.stringify({ setup, diagnostics }, null, 2))
          setCopied(true)
          setTimeout(() => setCopied(false), 1400)
        } catch { /* ignore */ }
      }

      return h('div', { className: 'zs-settings zs-scroll', role: 'dialog', 'aria-label': 'ZSearch 设置' },
        h('div', { className: 'zs-set-head' },
          h('b', null, '设置'),
          h('button', { className: 'zs-set-close', type: 'button', onClick: onClose, 'aria-label': '关闭设置' }, '×')),
        h('div', { className: 'zs-set-body' },
          section('外观',
            row('主题', '跟随 DSH 或手动覆盖', seg('theme', [['system', '跟随'], ['light', '浅色'], ['dark', '深色']])),
            row('回答字号', '只影响左侧回答正文', seg('fontSize', [['sm', '小'], ['md', '标准'], ['lg', '大']])),
            row('密度', '调整回答与证据卡的间距', seg('density', [['comfortable', '舒适'], ['compact', '紧凑']])),
            toggle('motion', '界面动效', '关闭后减少过渡与动画')),
          section('交互',
            toggle('selection', '划词浮层', '在对话里选中文字时显示 ZSearch 气泡')),
          section('检索',
            toggle('forceRefresh', '每次强制刷新', '跳过 10 分钟检索缓存；回答仍会重新生成'),
            h('p', { className: 'zs-set-note' }, '候选数量、来源权重和回答长度需要改 Host，本版暂不开放。')),
          section('结果页',
            toggle('showStats', '顶栏统计', '显示知乎/全网候选数与采纳数')),
          section('诊断',
            toggle('showDebug', '显示 DEBUG 按钮', '宿主 DEBUG 开启时在右上角显示调试入口'),
            status('Skill', setup?.skill?.found, setup?.skill?.found ? setup.skill.version ?? '已安装' : '未检出'),
            status('CLI', setup?.cli?.found, setup?.cli?.found ? setup.cli.version ?? '已安装' : '未安装'),
            status('Secret', setup?.auth?.configured, setup?.auth?.configured ? setup.auth.masked ?? '已配置' : '未配置'),
            last
              ? h('div', { className: 'zs-set-last' },
                h('span', null, '最近一次'),
                h('b', null, last.query),
                h('span', null, `${last.candidates} 候选 · ${last.cards} 卡 · ${last.cited} 引用 · ${last.backfilled} 补卡 · ${last.attempts} 次尝试 · ${last.elapsedMs}ms`))
              : h('p', { className: 'zs-set-note' }, '还没有检索诊断记录。'),
            h('div', { className: 'zs-set-actions' },
              h('button', { type: 'button', onClick: onRefreshSetup }, '重新检测'),
              h('button', { type: 'button', onClick: onOpenSetup }, '打开引导'),
              h('button', { type: 'button', onClick: copy }, copied ? '已复制' : '复制诊断'))),
          section('数据',
            row('本地状态', '清空本机保存的检索结果与面板位置', h('button', {
              className: 'zs-set-danger', type: 'button', onClick: onClearPanel,
            }, '清空'))),
          section('关于',
            h('div', { className: 'zs-set-about' },
              h('b', null, 'dsh-zsearch 0.3.0'),
              h('span', null, '知乎 + 全网检索，左答右证。'),
              h('span', null, '设置只保存在本机 origin，不包含任何凭据。'))),
        ),
        h('div', { className: 'zs-set-foot' },
          h('button', { className: 'zs-set-reset', type: 'button', onClick: onResetSettings }, '恢复默认'),
          h('span', null, '设置 v1')))
    }

    function PluginsPage({ items = [], loading = false, error = null, updatedAt = null, onBack, onOpen, onRetry }) {
      const [filter, setFilter] = useState('')
      const list = useMemo(() => {
        const q = filter.trim().toLowerCase()
        if (!q) return items
        return items.filter((item) =>
          String(item.name ?? '').toLowerCase().includes(q) ||
          String(item.category ?? '').toLowerCase().includes(q) ||
          String(item.desc ?? '').toLowerCase().includes(q))
      }, [items, filter])

      return h('div', { className: 'zs-plugins zs-scroll' },
        h('div', { className: 'zs-plugins-head' },
          h('button', { className: 'zs-back', type: 'button', onClick: onBack, title: '返回搜索', 'aria-label': '返回搜索' }, h(Icon, { name: 'back', size: 18 })),
          h('div', { className: 'zs-plugins-headtext' },
            h('h1', { className: 'zs-plugins-title' }, '热门插件'),
            h('p', { className: 'zs-plugins-sub' }, '按 GitHub Star 排序 · 点开看 AI 评价与社区讨论'))),
        h('label', { className: 'zs-plugins-search' },
          h(Icon, { name: 'search', size: 15 }),
          h('input', {
            value: filter, onChange: (event) => setFilter(event.target.value),
            placeholder: '搜索插件名 / 分类 / 关键词', 'aria-label': '搜索插件',
          })),
        loading
          ? h('div', { className: 'zs-plugins-state' }, h('span', { className: 'zs-spin' }), '正在载入插件目录…')
          : error
            ? h('div', { className: 'zs-plugins-state' },
              h('b', null, '插件目录加载失败'),
              h('span', null, error),
              h('button', { className: 'zs-install-btn primary', type: 'button', onClick: onRetry }, '重试'))
            : h('div', { className: 'zs-plugin-grid' }, list.map((item) => h('button', {
              key: item.id, className: 'zs-plugin-tile', type: 'button', onClick: () => onOpen(item),
            },
              h('div', { className: 'zs-plugin-tile-top' },
                h('span', { className: 'zs-plugin-tile-name' }, item.name),
                h('span', { className: 'zs-plugin-tag' }, item.category || '未分类')),
              h('div', { className: 'zs-plugin-tile-desc' }, item.desc || '暂无简介'),
              h('div', { className: 'zs-plugin-tile-stats' },
                h('span', null, `★ ${fmtCount(item.stars)}`),
                h('span', null, `↓ ${fmtCount(item.downloads)}/月`))))),
        h('p', { className: 'zs-plugins-note' },
          `目录整理于 ${updatedAt || '2026-11-04'}，为当时快照；安装前请确认插件来源。`),
      )
    }

    function App() {
      const [initial] = useState(() => {
        const pending = takePendingSearch()
        if (pending) {
          return { view: 'results', query: pending.text, attempt: beginSearch(pending.text) }
        }
        const saved = panelState
        if (saved && saved.view === 'results' && saved.query) {
          return { view: 'results', query: saved.query, attempt: saved.attempt ?? 0 }
        }
        return { view: 'home', query: saved?.query ?? '', attempt: saved?.attempt ?? 0 }
      })
      const [view, setView] = useState(initial.view)
      const [query, setQuery] = useState(initial.query)
      const [runId, setRunId] = useState(initial.attempt)
      const [plugin, setPlugin] = useState(null)
      const [pluginRun, setPluginRun] = useState(0)
      const [catalog, setCatalog] = useState(null)
      const [catalogState, setCatalogState] = useState({ loading: false, error: null })
      const [setup, setSetup] = useState(null)
      const [setupOpen, setSetupOpen] = useState(false)
      const [debugOpen, setDebugOpen] = useState(false)
      const [debugEnabled, setDebugEnabled] = useState(false)
      const [simulate, setSimulate] = useState(false)
      const [prefs, setPrefs] = useState(() => settings)
      const [settingsOpen, setSettingsOpen] = useState(false)

      const refreshSetup = () => {
        fetch('/zsearch/api/setup/status').then((r) => r.json()).then((data) => {
          setSetup(data)
          setDebugEnabled(data.debug === true)
        }).catch(() => {})
      }

      const updatePrefs = (patch) => setPrefs(writeSettings(patch))
      const resetPrefs = () => setPrefs(writeSettings({ ...DEFAULT_SETTINGS }))
      const clearPanel = () => {
        try { window.localStorage.removeItem(PANEL_KEY) } catch { /* ignore */ }
        panelState = null
        setSettingsOpen(false)
        setDebugOpen(false)
        setSetupOpen(false)
        setPlugin(null)
        setView('home')
        setQuery('')
        setRunId(0)
      }

      const loadCatalog = () => {
        setCatalogState({ loading: true, error: null })
        fetch('/zsearch/api/plugins/list')
          .then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            return response.json()
          })
          .then((data) => {
            setCatalog(data)
            setCatalogState({ loading: false, error: null })
          })
          .catch((error) => setCatalogState({ loading: false, error: String(error?.message ?? error) }))
      }

      const openPlugins = () => {
        setSetupOpen(false)
        setView('plugins')
        if (!catalog && !catalogState.loading) loadCatalog()
      }

      const openPlugin = (item) => {
        setPlugin(item)
        setPluginRun((value) => value + 1)
        setView('plugin')
      }

      const backToPlugins = () => setView('plugins')

      useEffect(() => { refreshSetup() }, [])
      useEffect(() => {
        if (!settingsOpen) return undefined
        const onKey = (event) => { if (event.key === 'Escape') setSettingsOpen(false) }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [settingsOpen])
      useEffect(() => {
        const applyPending = (pending) => {
          const attempt = beginSearch(pending.text)
          setPlugin(null)
          setQuery(pending.text)
          setRunId(attempt)
          setSetupOpen(false)
          setView('results')
        }
        const late = takePendingSearch()
        if (late) applyPending(late)
        searchWaiters.add(applyPending)
        return () => { searchWaiters.delete(applyPending) }
      }, [])
      const ready = simulate ? false : (setup ? Boolean(setup.cli?.found && setup.auth?.configured) : true)

      const search = (text) => {
        const value = String(text ?? '').trim()
        if (!value) return
        const attempt = beginSearch(value)
        setPlugin(null)
        setQuery(value)
        setRunId(attempt)
        setView('results')
      }

      const goHome = () => {
        updatePanel({ view: 'home' })
        setSetupOpen(false)
        setPlugin(null)
        setView('home')
      }

      const theme = prefs.theme === 'dark' ? ' zs-theme-dark' : prefs.theme === 'light' ? ' zs-theme-light' : ''
      return h('div', {
        className: `zs-root${(view === 'results' || view === 'plugin') && !setupOpen ? ' zs-results-on' : ''}${theme}`,
        'data-size': prefs.fontSize,
        'data-density': prefs.density,
        'data-motion': prefs.motion ? 'on' : 'off',
      },
        h('style', null, CSS),
        setupOpen
          ? h(Setup, { status: setup, onRefresh: refreshSetup, onDone: () => { refreshSetup(); setSetupOpen(false) } })
          : view === 'results'
            ? h(Results, {
              key: runId,
              query, runId, onSearch: search, onHome: goHome,
              setup, ready, showStats: prefs.showStats, onOpenSetup: () => setSetupOpen(true),
            })
            : view === 'plugins'
              ? h(PluginsPage, {
                items: catalog?.items ?? [],
                loading: catalogState.loading,
                error: catalogState.error,
                updatedAt: catalog?.updatedAt,
                onBack: goHome,
                onOpen: openPlugin,
                onRetry: loadCatalog,
              })
              : view === 'plugin' && plugin
                ? h(Results, {
                  key: `plugin-${plugin.id}-${pluginRun}`,
                  query: `如何评价 DSH 插件「${plugin.name}」？`,
                  runId: pluginRun,
                  plugin,
                  pluginId: plugin.id,
                  persist: false,
                  onSearch: search,
                  onHome: goHome,
                  onBack: backToPlugins,
                  backLabel: '返回热门插件',
                  setup, ready, showStats: prefs.showStats,
                  onOpenSetup: () => setSetupOpen(true),
                })
                : h(Home, { onSearch: search, setup, ready, onOpenSetup: () => setSetupOpen(true), onOpenPlugins: openPlugins }),
        h('div', { className: 'zs-corner' },
          debugEnabled && prefs.showDebug
            ? h('div', { className: 'zs-debug-wrap' },
              h('button', {
                className: 'zs-debug-btn', type: 'button',
                onClick: () => { setSettingsOpen(false); setDebugOpen((v) => !v) },
              }, 'DEBUG'),
              debugOpen
                ? h('div', { className: 'zs-debug-menu' },
                  h('button', { className: 'zs-debug-item', type: 'button', onClick: () => { setSetupOpen(true); setDebugOpen(false) } }, '打开 Onboarding 页'),
                  h('button', { className: 'zs-debug-item', type: 'button', onClick: () => { goHome(); setDebugOpen(false) } }, '返回搜索首页'),
                  h('button', { className: 'zs-debug-item', type: 'button', onClick: () => { setSimulate((v) => !v); setDebugOpen(false) } }, simulate ? '关闭“模拟未就绪”' : '模拟未就绪（仅本次）'),
                  h('button', { className: 'zs-debug-item', type: 'button', onClick: () => { refreshSetup(); setDebugOpen(false) } }, '重新检测能力状态'),
                  h('div', { className: 'zs-debug-status' },
                    `Skill ${setup?.skill?.found ? setup.skill.version ?? '✓' : '缺失'} · CLI ${setup?.cli?.found ? setup.cli.version ?? '✓' : '缺失'} · Secret ${setup?.auth?.configured ? setup.auth.masked ?? '✓' : '未配置'}`,
                  ),
                )
                : null,
            )
            : null,
          h('button', {
            className: 'zs-set-btn', type: 'button', title: 'ZSearch 设置', 'aria-label': 'ZSearch 设置',
            onClick: () => { setDebugOpen(false); setSettingsOpen((v) => !v) },
          }, h(Icon, { name: 'settings', size: 16, stroke: 1.7 })),
        ),
        settingsOpen
          ? h('div', { className: 'zs-set-backdrop', onClick: () => setSettingsOpen(false) })
          : null,
        settingsOpen
          ? h(SettingsPanel, {
            value: prefs,
            onChange: updatePrefs,
            onClose: () => setSettingsOpen(false),
            setup,
            onRefreshSetup: refreshSetup,
            onOpenSetup: () => { setSetupOpen(true); setSettingsOpen(false) },
            onClearPanel: clearPanel,
            onResetSettings: resetPrefs,
          })
          : null,
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'dsh-zsearch' }, App))
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
          { name: 'sidebar.panellist', id: 'dsh-zsearch', order: 6, label: 'ZSearch' },
          ({ size = 20, active }) => h('svg', {
            width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
            stroke: active ? BLUE : 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
            'aria-hidden': true,
          },
            h('circle', { cx: 11, cy: 11, r: 7 }),
            h('path', { d: 'M16.5 16.5 21 21' })),
        ))

        const openWith = (text) => {
          if (!requestSearch(text)) return
          const layout = ctx.get('layout')
          if (!layout) {
            pendingSearch = null
            console.error('[dsh-zsearch] layout service unavailable')
            return
          }
          try {
            layout.selectPanel('dsh-zsearch')
          } catch (error) {
            pendingSearch = null
            console.error('[dsh-zsearch] failed to open the search panel', error)
          }
        }

          function SelectionPill() {
            const [hit, setHit] = useState(null)
            const pillRef = useRef(null)
            const pressedRef = useRef(false)

            useEffect(() => {
              let frame = 0
              let dragging = false

              const clear = () => setHit(null)
              const sourceOf = (node) => {
                const element = node?.nodeType === 1 ? node : node?.parentElement
                return element?.closest?.('[data-text-interaction-source]') ?? null
              }
              const update = () => {
                if (pressedRef.current) return
                if (!settings.selection) { clear(); return }
                try {
                  const selection = document.getSelection()
                  if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) {
                    clear()
                    return
                  }
                  const range = selection.getRangeAt(0)
                  const source = sourceOf(range.startContainer)
                  if (!source || source !== sourceOf(range.endContainer)) {
                    clear()
                    return
                  }
                  if (!source.closest('[data-chat-flow]')) {
                    clear()
                    return
                  }
                  if (source.closest('[hidden], [inert], [data-text-interaction-exclude]')) {
                    clear()
                    return
                  }
                  const text = normalizeSelection(selection.toString())
                  if (!text) {
                    clear()
                    return
                  }
                  const rect = range.getBoundingClientRect()
                  if (!rect || (rect.width === 0 && rect.height === 0)) {
                    clear()
                    return
                  }
                  if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
                    clear()
                    return
                  }
                  const height = 30
                  const right = Math.max(8, window.innerWidth - rect.right)
                  let top = rect.top - height - 8
                  if (top < 8) top = rect.bottom + 8
                  if (top + height > window.innerHeight - 8) top = window.innerHeight - height - 8
                  top = Math.max(8, top)
                  setHit((current) => {
                    if (current && current.text === text && current.right === right && current.top === top) return current
                    return { text, right, top }
                  })
                } catch {
                  clear()
                }
              }
              const schedule = () => {
                if (frame) return
                frame = window.requestAnimationFrame(() => {
                  frame = 0
                  update()
                })
              }
              const onSelectionChange = () => { if (!dragging) schedule() }
              const onPointerDown = (event) => {
                if (pillRef.current?.contains(event.target)) return
                const target = event.target instanceof Element ? event.target : null
                dragging = event.button === 0 && target !== null && target.closest('[data-chat-flow]') !== null
                clear()
              }
              const onPointerUp = () => {
                if (!dragging) return
                dragging = false
                schedule()
              }
              const onKeyUp = () => schedule()
              const onKeyDown = (event) => { if (event.key === 'Escape') clear() }
              const onScroll = () => schedule()
              const onResize = () => clear()
              const onCancel = () => { dragging = false; clear() }

              document.addEventListener('selectionchange', onSelectionChange)
              document.addEventListener('pointerdown', onPointerDown, true)
              document.addEventListener('pointerup', onPointerUp)
              document.addEventListener('pointercancel', onCancel)
              document.addEventListener('keyup', onKeyUp)
              document.addEventListener('keydown', onKeyDown)
              document.addEventListener('scroll', onScroll, true)
              window.addEventListener('resize', onResize)
              window.addEventListener('blur', onCancel)
              return () => {
                if (frame) window.cancelAnimationFrame(frame)
                document.removeEventListener('selectionchange', onSelectionChange)
                document.removeEventListener('pointerdown', onPointerDown, true)
                document.removeEventListener('pointerup', onPointerUp)
                document.removeEventListener('pointercancel', onCancel)
                document.removeEventListener('keyup', onKeyUp)
                document.removeEventListener('keydown', onKeyDown)
                document.removeEventListener('scroll', onScroll, true)
                window.removeEventListener('resize', onResize)
                window.removeEventListener('blur', onCancel)
              }
            }, [])

            const open = () => {
              if (!hit) return
              const text = hit.text
              setHit(null)
              openWith(text)
            }

            return h(React.Fragment, null,
              h('style', null, PILL_CSS),
              hit
                ? h('button', {
                  ref: pillRef,
                  className: 'zs-selpill',
                  type: 'button',
                  style: { right: hit.right, top: hit.top },
                  title: '在 ZSearch 中搜索选中内容',
                  'aria-label': '在 ZSearch 中搜索选中内容',
                  onPointerDown: (event) => { event.preventDefault(); pressedRef.current = true },
                  onPointerUp: () => { window.setTimeout(() => { pressedRef.current = false }, 0) },
                  onClick: open,
                },
                  h('svg', {
                    width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none',
                    stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', 'aria-hidden': true,
                  },
                    h('circle', { cx: 11, cy: 11, r: 7 }),
                    h('path', { d: 'M16.5 16.5 21 21' })),
                  h('span', null, 'ZSearch'))
                : null,
            )
          }

        // Register the selection pill unconditionally: the layout service can mount
        // after this plugin applies, and gating here made the overlay silently vanish.
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'dsh-zsearch-selection',
          order: 20,
        }, SelectionPill))
      },
    }
  },
})

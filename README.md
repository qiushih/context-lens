# Context Lens

A Chrome extension that explains selected text **based on what the selection actually is**.
Select a term on a page, click **Explain**, and get an explanation shaped for that kind of
thing — a technical term gets a technical answer, a citation gets its source located, a
formula gets its symbols broken down.

## Architecture

```
  ┌── content script ────────────┐        ┌── service worker ───────────────────────┐
  │                              │        │                                          │
  │  1. Selection                │        │  3. Classifier ──► Router                │
  │     mouseup / ⌘⇧E            │        │     heuristics       category → skill    │
  │        │                     │        │     ↓ (only if unresolved)               │
  │  2. Context extraction       │───────►│     Haiku 4.5 label call                 │
  │     headings, surrounding    │ EXPLAIN│              │                           │
  │     text, code block, meta   │        │  4. Skill ───┘                           │
  │        │                     │◄───────│     system prompt + context → Opus 5     │
  │  5. Popup (shadow DOM)       │ result │                                          │
  └──────────────────────────────┘        └──────────────────────────────────────────┘
```

**Why the stages sit where they do**

- **Context extraction runs in the content script** — it is the only side with a DOM.
  It is cheap and synchronous: headings above the selection, the surrounding paragraph
  clipped to ±700 characters, whether the selection is inside `<pre>/<code>`, and the
  code language from the highlighter's class names.
- **Classification is two-tier.** Heuristics settle what the DOM already answers — code
  blocks, LaTeX, citation markers — for free. Only what is left goes to a small
  `claude-haiku-4-5` call, because no regex separates "technical term" from "vocabulary"
  from "person". `classify()` returns a *label*; deciding what to do with it is the
  router's job.
- **A skill is a system prompt plus a token budget.** Its value is that it knows what a
  good answer *for its category* looks like. The router maps category → skill; adding a
  category is one new file plus one registry line.
- **The API key lives in the service worker.** The content script never sees it.

## Repository structure

```
src/
  manifest.json          MV3 manifest
  content/
    index.js             pipeline entry: selection → context → message → popup
    selection.js         reads window.getSelection() and its screen rect
    context.js           stage 2 — page context extraction (DOM only)
    popup.js             stage 5 — floating chip + panel in a closed shadow root
  background/
    index.js             service worker: orchestration, settings, error mapping
    classify.js          stage 3a — heuristics + Haiku classifier
    anthropic.js         SDK client, model IDs, refusal handling
  skills/
    index.js             stage 3b — the router (category → skill registry)
    prompt.js            shared house rules + context rendering
    technical-term.js    implemented skill
    fallback.js          generic skill for unrouted categories
  shared/
    categories.js        the category enum — single source of truth
    messages.js          content ↔ worker message types
    settings.js          chrome.storage wrapper
  options/               API key + target language
test/pipeline.test.mjs   heuristics, routing, prompt assembly (no network)
build.mjs                esbuild: content → IIFE, worker → ESM
```

## Install

```bash
npm install && npm run build
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
select the `dist/` folder. Open the extension's options page and paste an Anthropic API
key.

Use it: select text on any page, click the **Explain** chip, or press ⌘⇧E / Ctrl⇧E.

`npm run watch` rebuilds on save; click the reload icon on the extension card to pick
changes up.

## What is implemented

This is the vertical slice: every stage of the pipeline is real, and one skill is
authored end to end.

| Category | Classifier | Skill |
| --- | --- | --- |
| technical terms | model | **`technical-term.js`** |
| code | heuristic (code block / syntax) | fallback |
| formulas | heuristic (LaTeX / math symbols) | fallback |
| citations | heuristic (`[12]`, `et al.`, `doi:`) | fallback |
| vocabulary | model | fallback |
| people / companies | model | fallback |

The five unrouted categories currently answer through `skills/fallback.js`, which is
generic but works — the popup still shows the classified label. Writing each remaining
skill is one file and one line in `skills/index.js`.

## Model usage

- Explanations: `claude-opus-5`, `output_config: { effort: "low" }` (a popup answer is a
  small task; low effort is faster and cheaper with adaptive thinking left on), and
  `fallbacks: "default"` behind the `server-side-fallback-2026-07-01` beta so a declined
  request is re-run server-side instead of surfacing a refusal.
- Classification: `claude-haiku-4-5`, `max_tokens: 256`, JSON label only.

## Security

The API key is stored in `chrome.storage.local` and sent from the extension directly to
`api.anthropic.com`. That is acceptable for personal use, but anyone with access to the
browser profile can read it, and a shipped product should proxy requests through a server
that holds the key instead — the only change needed is swapping `background/anthropic.js`
for a `fetch` to your endpoint.

## Known gaps

- No response streaming; the popup shows a spinner until the full answer lands.
- No caching — the same selection on the same page costs a second round trip.
- The classifier parses JSON out of the model's text. Structured outputs
  (`output_config.format`) would make that unnecessary.
- The citation skill will need web search to actually *locate* a source; right now
  nothing fetches anything outside the page.

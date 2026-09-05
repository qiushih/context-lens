# Context Lens

A Chrome extension that explains selected text **based on what the selection actually is**.
Select a term on a page, click **Explain**, and get an explanation shaped for that kind of
thing — a technical term gets a technical answer, a citation gets its source located, a
formula gets its symbols broken down.

## Architecture

```
  ┌── content script ────────────┐        ┌── service worker ───────────────────────┐
  │                              │        │                                          │
  │  1. Selection                │        │  3. Heuristics                           │
  │     mouseup / ⌘⇧E            │        │     code / formula / citation → category │
  │        │                     │        │        │                                 │
  │  2. Context extraction       │──port─►│  4. ONE streamed call                    │
  │     headings, surrounding    │        │     known category → that answer shape   │
  │     text, code block, meta   │        │     ambiguous → CATEGORY line, then      │
  │        │                     │        │                 the explanation          │
  │  5. Popup (shadow DOM)       │◄─────── │                                          │
  │     opens on click, labels   │ category│                                          │
  │     itself, streams tokens   │ deltas  │                                          │
  └──────────────────────────────┘  done   └──────────────────────────────────────────┘
```

**Why the stages sit where they do**

- **Context extraction runs in the content script** — it is the only side with a DOM.
  Measured at 0.02–0.16 ms, including on a 10,890-node Wikipedia article, so it is free.
  It collects headings above the selection, the surrounding paragraph clipped to ±700
  characters, whether the selection is inside `<pre>/<code>`, and the code language from
  the highlighter's class names.
- **Heuristics run first and are worth more than the tokens they save.** When the DOM
  already answers the question — a selection inside a code block, LaTeX, a citation
  marker — the popup can render the category label before the network is touched at all.
- **Classification and explanation are one call.** For ambiguous selections the model
  emits `CATEGORY: <label>` as the first line of the same response it explains in. The
  label lands in the first few tokens, so the popup still identifies itself almost
  immediately, and there is no second sequential round trip.
- **The popup streams.** It opens on click with the selection already in it, swaps in the
  category when known, and appends prose as it is generated. There is no state in which
  the user is looking at a bare spinner.
- **The API key lives in the service worker.** The content script never sees it.

## Repository structure

```
src/
  manifest.json          MV3 manifest
  content/
    index.js             pipeline entry: selection → context → port → popup
    selection.js         reads window.getSelection() and its screen rect
    context.js           stage 2 — page context extraction (DOM only)
    popup.js             stage 5 — floating chip + streaming panel, closed shadow root
  background/
    index.js             service worker: port lifecycle, settings, error mapping
    explain.js           stage 4 — the single streamed call + CATEGORY-line parser
    classify.js          stage 3 — heuristics only
    anthropic.js         SDK client construction
    cache.js             chrome.storage.session memo, so a re-select is instant
  skills/
    index.js             the router (category → skill), and shape assembly
    shapes.js            what a good answer looks like, per category
    technical-term.js    the one dedicated skill
    prompt.js            known-category and triage prompt builders
  shared/
    categories.js        the category enum — single source of truth
    models.js            model tiers and their per-model request params
    messages.js          content ↔ worker channel constants
    settings.js          chrome.storage wrapper
  options/               API key, model tier, target language
test/
  pipeline.test.mjs      heuristics, routing, prompt assembly
  stream.test.mjs        CATEGORY-line parsing + explain() over a fake stream
bench/latency.mjs        live per-stage latency measurement, old path vs new
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
changes up. `npm test` runs the offline suite. `npm run bench` measures real latency —
it needs `ANTHROPIC_API_KEY` and makes live calls.

## Latency

The pipeline was rebuilt around time-to-first-useful-pixel. Where the time was going:

| Stage | Old | Now |
| --- | --- | --- |
| Selection + context extraction | 0.02–0.16 ms (measured) | unchanged |
| Wake the service worker | on the critical path | pre-warmed when the chip appears |
| Classification | separate Haiku round trip | free (heuristic) or fused into the explanation |
| Explanation | Opus 5, thinking on, non-streaming | Haiku 4.5, no thinking, streamed |
| First thing on screen | the finished answer, or nothing | panel on click → category → tokens |

Input size was never the problem: the whole request is ~800 tokens. The cost was two
sequential round trips, a frontier model thinking before answering, and a non-streaming
response, which together make time-to-first-token identical to time-to-last-token.

Per-model request params are not interchangeable, and getting them wrong is a 400 rather
than a slowdown — see `src/shared/models.js`. Haiku 4.5 takes no `effort` parameter and
does no thinking unless given a budget. Sonnet 5 accepts disabled thinking, which is the
right call for a popup answer with no tools in play. Opus 5 keeps thinking on at low
effort, because turning it off on that model has known failure modes.

`fallbacks: "default"` (server-side refusal fallback) was dropped: it lives on the beta
messages namespace, which has no streaming helper in SDK 0.71.x. Streaming is worth more
here than automatic refusal recovery on "what does this word mean". Refusals are still
detected and surfaced.

## What is implemented

Every stage of the pipeline is real. One skill is authored end to end.

| Category | How it is identified | Answer shape |
| --- | --- | --- |
| code | heuristic — code block or syntax | `shapes.js` |
| formulas | heuristic — LaTeX / math symbols | `shapes.js` |
| citations | heuristic — `[12]`, `et al.`, `doi:` | `shapes.js` |
| technical terms | model, in the explanation call | **`technical-term.js`** |
| vocabulary | model, in the explanation call | `shapes.js` |
| people / companies | model, in the explanation call | `shapes.js` |

`shapes.js` holds a one-line answer shape per category. Registering a real skill module
replaces its entry everywhere at once — in the known-category prompt and in the triage
prompt, which is assembled from every shape.

## Security

The API key is stored in `chrome.storage.local` and sent from the extension directly to
`api.anthropic.com`. That is acceptable for personal use, but anyone with access to the
browser profile can read it, and a shipped product should proxy requests through a server
that holds the key instead — the only change needed is swapping `background/anthropic.js`
for a `fetch` to your endpoint.

## Known gaps

- The five placeholder answer shapes are one line each. Real skills will want more, and
  citations in particular will need web search to actually *locate* a source.
- Near the bottom of the viewport the panel is anchored above the selection using its
  height at open time, and re-anchored once when streaming finishes. It can overhang
  briefly while growing.
- `heuristicCategory` never fires for prose, so every vocabulary/entity/technical-term
  selection still costs one model call. A local frequency list could answer the easiest
  vocabulary lookups with no call at all.
- The heading trail walks direct siblings only, so it misses wrapper-wrapped headings —
  Wikipedia returns an empty trail. Measured, not yet fixed.

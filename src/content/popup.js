/**
 * The floating UI. Everything lives in a shadow root so host-page CSS can't
 * reach it and our CSS can't leak out.
 *
 * Latency behaviour: the panel opens on click with the selection already in
 * it, the category label swaps in the moment it is known (0 ms on a heuristic
 * hit, first tokens otherwise), and prose is appended as it streams. There is
 * no state in which the user is looking at a bare spinner.
 */

const STYLES = `
:host { all: initial; }
/* The UA's [hidden]{display:none} loses to .chip{display:flex} on specificity,
   which would leave the chip parked in the top-left corner forever. */
.chip[hidden], .panel[hidden] { display: none !important; }
.chip, .panel {
  position: absolute;
  z-index: 2147483647;
  font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: var(--cl-fg);
  background: var(--cl-bg);
  border: 1px solid var(--cl-border);
  border-radius: 10px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
  box-sizing: border-box;
}
:host {
  --cl-bg: #ffffff;
  --cl-fg: #16181d;
  --cl-muted: #6b7280;
  --cl-border: #e3e5ea;
  --cl-accent: #a8562b;
  --cl-code-bg: #f4f4f5;
}
@media (prefers-color-scheme: dark) {
  :host {
    --cl-bg: #1b1c1f;
    --cl-fg: #ececee;
    --cl-muted: #9aa0aa;
    --cl-border: #34363b;
    --cl-accent: #e2926a;
    --cl-code-bg: #26282c;
  }
}
.chip {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 10px; cursor: pointer; user-select: none; font-weight: 500;
}
.chip:hover { border-color: var(--cl-accent); }
.chip .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cl-accent); }
.panel { width: 340px; max-height: 380px; overflow: auto; padding: 12px 14px 14px; }
.head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; margin-bottom: 8px;
}
.tag {
  font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase;
  color: var(--cl-accent);
  transition: opacity .12s ease;
}
.tag.pending { color: var(--cl-muted); opacity: .8; }
.close {
  border: 0; background: transparent; color: var(--cl-muted);
  cursor: pointer; font-size: 15px; line-height: 1; padding: 2px 4px;
}
.subject { font-weight: 600; margin-bottom: 6px; word-break: break-word; }
.body p { margin: 0 0 8px; }
.body ul { margin: 0 0 8px; padding-left: 18px; }
.body li { margin: 0 0 3px; }
.body code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
  background: var(--cl-code-bg); border-radius: 4px; padding: 1px 4px;
}
.body.streaming > :last-child::after {
  content: ""; display: inline-block; width: 6px; height: 13px;
  background: var(--cl-accent); opacity: .7; vertical-align: -2px; margin-left: 2px;
  animation: blink 1s steps(2, start) infinite;
}
@keyframes blink { to { visibility: hidden; } }
.muted { color: var(--cl-muted); }
.error button {
  margin-top: 8px; font: inherit; cursor: pointer;
  background: var(--cl-accent); color: #fff; border: 0; border-radius: 6px; padding: 5px 10px;
}
`;

const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Deliberately tiny markdown subset: bold, inline code, bullets, paragraphs. */
function renderMarkdown(text) {
  const inline = (s) =>
    escapeHtml(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  return text
    .trim()
    .split(/\n{2,}|\n(?=[-*] )/)
    .map((chunk) => {
      const lines = chunk.split("\n");
      if (lines.every((l) => /^\s*[-*] /.test(l))) {
        const items = lines.map((l) => `<li>${inline(l.replace(/^\s*[-*] /, ""))}</li>`).join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${inline(chunk.replace(/\n/g, " "))}</p>`;
    })
    .join("");
}

export function createLens({ onExplain, onOpenSettings }) {
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;top:0;left:0;width:0;height:0;";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>${STYLES}</style>`;
  document.documentElement.appendChild(host);

  const chip = document.createElement("div");
  chip.className = "chip";
  chip.innerHTML = `<span class="dot"></span><span>Explain</span>`;
  chip.hidden = true;

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.hidden = true;

  root.append(chip, panel);

  // mousedown, not click: the host page's mouseup handler would clear the
  // selection before a click ever lands.
  chip.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onExplain();
  });

  /** Place an element by the selection, flipping above it near the fold. */
  function place(el, rect) {
    el.hidden = false;
    const viewportH = document.documentElement.clientHeight;
    const viewportW = document.documentElement.clientWidth;
    const height = el.getBoundingClientRect().height || 0;
    const width = el.getBoundingClientRect().width || 340;

    const below = rect.bottom + 8;
    const flip = below + height > viewportH && rect.top - height - 8 > 0;

    el.style.top = `${(flip ? rect.top - height - 8 : below) + window.scrollY}px`;
    el.style.left = `${
      Math.min(
        Math.max(8, rect.left),
        Math.max(8, viewportW - width - 8),
      ) + window.scrollX
    }px`;
  }

  // Streaming state
  let buffer = "";
  let frame = null;
  let bodyEl = null;
  let anchor = null;

  function flush() {
    frame = null;
    if (bodyEl) bodyEl.innerHTML = renderMarkdown(buffer);
  }

  function shell({ tag, tagPending, inner }) {
    panel.innerHTML = `
      <div class="head">
        <span class="tag${tagPending ? " pending" : ""}">${escapeHtml(tag)}</span>
        <button class="close" title="Close">&#10005;</button>
      </div>
      ${inner}`;
    panel.querySelector(".close").addEventListener("mousedown", (e) => {
      e.preventDefault();
      hide();
    });
  }

  function hide() {
    chip.hidden = true;
    panel.hidden = true;
    if (frame) cancelAnimationFrame(frame);
    frame = null;
    bodyEl = null;
    buffer = "";
  }

  return {
    node: host,
    contains: (target) => host.contains(target),
    hide,

    showChip(rect) {
      panel.hidden = true;
      place(chip, rect);
    },

    /** Opens immediately on click - before any network work starts. */
    open(rect, subject) {
      chip.hidden = true;
      buffer = "";
      anchor = rect;
      shell({
        tag: "Identifying",
        tagPending: true,
        inner: `<div class="subject">${escapeHtml(subject)}</div>
                <div class="body streaming"><p class="muted"></p></div>`,
      });
      bodyEl = panel.querySelector(".body");
      place(panel, rect);
    },

    /** Swaps the header label in as soon as the category is known. */
    setCategory(label) {
      const tag = panel.querySelector(".tag");
      if (!tag) return;
      tag.textContent = label;
      tag.classList.remove("pending");
    },

    pushDelta(text) {
      if (!bodyEl) return;
      buffer += text;
      if (!frame) frame = requestAnimationFrame(flush);
    },

    finish() {
      if (frame) cancelAnimationFrame(frame);
      flush();
      bodyEl?.classList.remove("streaming");
      // Content grew while streaming; re-anchor if that pushed it off-screen.
      if (anchor) place(panel, anchor);
    },

    fail(rect, { message, actionLabel }) {
      chip.hidden = true;
      shell({
        tag: "Context Lens",
        tagPending: true,
        inner: `<div class="error">${escapeHtml(message)}
          ${actionLabel ? `<div><button class="settings">${escapeHtml(actionLabel)}</button></div>` : ""}
        </div>`,
      });
      panel.querySelector(".settings")?.addEventListener("mousedown", (e) => {
        e.preventDefault();
        onOpenSettings();
      });
      bodyEl = null;
      place(panel, rect);
    },
  };
}

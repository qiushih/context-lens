/**
 * The floating UI. Everything lives in a shadow root so host-page CSS can't
 * reach it and our CSS can't leak out.
 */

const STYLES = `
:host { all: initial; }
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
  padding: 5px 10px; cursor: pointer; user-select: none;
  font-weight: 500;
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
}
.close {
  border: 0; background: transparent; color: var(--cl-muted);
  cursor: pointer; font-size: 15px; line-height: 1; padding: 2px 4px;
}
.subject {
  font-weight: 600; margin-bottom: 6px; word-break: break-word;
}
.body p { margin: 0 0 8px; }
.body ul { margin: 0 0 8px; padding-left: 18px; }
.body li { margin: 0 0 3px; }
.body code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
  background: var(--cl-code-bg); border-radius: 4px; padding: 1px 4px;
}
.muted { color: var(--cl-muted); }
.error { color: var(--cl-fg); }
.error button {
  margin-top: 8px; font: inherit; cursor: pointer;
  background: var(--cl-accent); color: #fff; border: 0; border-radius: 6px; padding: 5px 10px;
}
.spinner {
  width: 12px; height: 12px; border-radius: 50%; display: inline-block;
  border: 2px solid var(--cl-border); border-top-color: var(--cl-accent);
  animation: spin .7s linear infinite; vertical-align: -2px; margin-right: 6px;
}
@keyframes spin { to { transform: rotate(360deg); } }
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

  /** Place an element under the selection, kept inside the viewport. */
  function place(el, rect) {
    el.hidden = false;
    const top = rect.bottom + window.scrollY + 8;
    const width = el.getBoundingClientRect().width || 340;
    const left = Math.min(
      Math.max(8 + window.scrollX, rect.left + window.scrollX),
      window.scrollX + document.documentElement.clientWidth - width - 8,
    );
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
  }

  function panelShell(inner, tag = "Context Lens") {
    panel.innerHTML = `
      <div class="head"><span class="tag">${escapeHtml(tag)}</span>
        <button class="close" title="Close">✕</button></div>
      ${inner}`;
    panel.querySelector(".close").addEventListener("mousedown", (e) => {
      e.preventDefault();
      hide();
    });
  }

  function hide() {
    chip.hidden = true;
    panel.hidden = true;
  }

  return {
    node: host,
    contains: (target) => host.contains(target),
    hide,
    showChip(rect) {
      panel.hidden = true;
      place(chip, rect);
    },
    showLoading(rect, subject) {
      chip.hidden = true;
      panelShell(
        `<div class="subject">${escapeHtml(subject)}</div>
         <div class="muted"><span class="spinner"></span>Reading the page…</div>`,
      );
      place(panel, rect);
    },
    showResult(rect, { label, subject, explanation }) {
      chip.hidden = true;
      panelShell(
        `<div class="subject">${escapeHtml(subject)}</div>
         <div class="body">${renderMarkdown(explanation)}</div>`,
        label,
      );
      place(panel, rect);
    },
    showError(rect, { message, actionLabel }) {
      chip.hidden = true;
      panelShell(
        `<div class="error">${escapeHtml(message)}
          ${actionLabel ? `<div><button class="settings">${escapeHtml(actionLabel)}</button></div>` : ""}
         </div>`,
      );
      panel.querySelector(".settings")?.addEventListener("mousedown", (e) => {
        e.preventDefault();
        onOpenSettings();
      });
      place(panel, rect);
    },
  };
}

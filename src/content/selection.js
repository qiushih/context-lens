/** Reads the current selection and where it sits on screen. */
export function readSelection() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;

  const text = sel.toString().trim();
  if (!text) return null;

  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;

  return { text, range, rect };
}

/** Selections longer than this are almost never a "what is this?" question. */
export const MAX_SELECTION_CHARS = 1200;

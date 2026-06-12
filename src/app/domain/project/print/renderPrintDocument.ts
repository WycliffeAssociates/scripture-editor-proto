import type { PrintChangeSet, PrintVerseEntry } from "./buildPrintChangeSet.ts";

/**
 * Renders a {@link PrintChangeSet} into a self-contained, monochrome document
 * and sends it to the browser print dialog (from which the user can also
 * "Save as PDF").
 *
 * The document is intentionally standalone — its own minimal stylesheet, no app
 * chrome, no app `@media print` rules — so it prints predictably on any printer.
 * Change is encoded typographically, never by color: added text is underlined,
 * removed text is struck through. That survives a plain black-and-white printer.
 */

export type RenderPrintDocumentArgs = {
  changeSet: PrintChangeSet;
  /** Document title, e.g. "Changes between … and …". */
  title: string;
  /** One-line context under the title (date range, project, who). */
  subtitle: string;
  /** Header label over the "before" (baseline) column. */
  beforeLabel: string;
  /** Header label over the "after" (current) column. */
  afterLabel: string;
  /** Localized, human-readable book name for a book code. */
  bookLabel: (bookCode: string) => string;
  /** Base body font in points; the popover's size control feeds this. */
  fontPt: number;
  /** Footer note shown once at the end, e.g. legend. */
  legend: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderRuns(runs: PrintVerseEntry["oldRuns"]): string {
  if (runs.length === 0) return `<span class="empty">—</span>`;
  return runs
    .map((run) => {
      const text = escapeHtml(run.text);
      if (run.mark === "added") return `<u class="add">${text}</u>`;
      if (run.mark === "removed") return `<s class="del">${text}</s>`;
      return text;
    })
    .join("");
}

function renderEntry(entry: PrintVerseEntry): string {
  const ref = escapeHtml(entry.semanticSid);
  return `<div class="v ${entry.status}"><span class="ref">${ref}</span><span class="before">${renderRuns(entry.oldRuns)}</span><span class="after">${renderRuns(entry.newRuns)}</span></div>`;
}

function buildHtml(args: RenderPrintDocumentArgs): string {
  const { changeSet, fontPt } = args;
  const bodyPt = fontPt.toFixed(2);
  const refPt = (fontPt * 0.85).toFixed(2);
  const bookPt = (fontPt * 1.5).toFixed(2);
  const chapterPt = (fontPt * 1.15).toFixed(2);

  const books = changeSet.books
    .map((book) => {
      const chapters = book.chapters
        .map((chapter) => {
          const entries = chapter.entries.map(renderEntry).join("");
          return `<h3 class="chapter">${escapeHtml(args.bookLabel(book.bookCode))} ${chapter.chapterNum}</h3><div class="entries">${entries}</div>`;
        })
        .join("");
      return `<section class="book"><h2 class="bookTitle">${escapeHtml(args.bookLabel(book.bookCode))}</h2>${chapters}</section>`;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(args.title)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Georgia, "Times New Roman", serif;
    font-size: ${bodyPt}pt;
    line-height: 1.35;
    color: #000;
    padding: 1.5rem;
  }
  header { margin-bottom: 0.6rem; border-bottom: 1px solid #000; padding-bottom: 0.5rem; }
  h1.docTitle { font-size: ${bookPt}pt; margin: 0 0 0.15rem; }
  .docSubtitle { font-size: ${refPt}pt; color: #333; }
  .colhead {
    display: grid;
    grid-template-columns: 3.4em 1fr 1fr;
    gap: 0.6rem;
    font-weight: 700;
    font-size: ${refPt}pt;
    margin-bottom: 0.4rem;
    padding-bottom: 0.2rem;
    border-bottom: 1px solid #000;
  }
  .clabel { text-transform: uppercase; letter-spacing: 0.04em; }
  section.book { break-inside: auto; margin-top: 1.75rem; }
  section.book:first-of-type { margin-top: 0; }
  h2.bookTitle { font-size: ${bookPt}pt; margin: 0 0 0.4rem; padding-bottom: 0.15rem; border-bottom: 1px solid #999; }
  h3.chapter { font-size: ${chapterPt}pt; margin: 0.6rem 0 0.25rem; }
  .v {
    display: grid;
    grid-template-columns: 3.4em 1fr 1fr;
    gap: 0.6rem;
    align-items: start;
    margin: 0 0 0.25rem;
    break-inside: avoid;
  }
  .v .ref { font-weight: 700; font-size: ${refPt}pt; white-space: nowrap; }
  .v .before { padding-right: 0.6rem; border-right: 1px solid #ccc; }
  .v .empty { color: #bbb; }
  u.add { text-decoration: underline; }
  s.del { text-decoration: line-through; }
  footer { margin-top: 1.25rem; border-top: 1px solid #999; padding-top: 0.4rem; font-size: ${refPt}pt; color: #333; }
  @page { margin: 1.5cm; }
</style>
</head>
<body>
<header>
  <h1 class="docTitle">${escapeHtml(args.title)}</h1>
  <div class="docSubtitle">${escapeHtml(args.subtitle)}</div>
</header>
<div class="colhead">
  <span></span>
  <span class="clabel">${escapeHtml(args.beforeLabel)}</span>
  <span class="clabel">${escapeHtml(args.afterLabel)}</span>
</div>
${books}
<footer>${escapeHtml(args.legend)}</footer>
</body>
</html>`;
}

/**
 * Writes the document into a hidden iframe and triggers print. An iframe avoids
 * popup-blocker problems that `window.open` hits, and we clean it up after the
 * print dialog closes.
 */
export function printChangeDocument(args: RenderPrintDocumentArgs): void {
  const html = buildHtml(args);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";

  const cleanup = () => {
    // Defer so the print dialog has fully detached from the frame first.
    window.setTimeout(() => {
      iframe.remove();
    }, 0);
  };

  iframe.onload = () => {
    const frameWindow = iframe.contentWindow;
    if (!frameWindow) {
      cleanup();
      return;
    }
    frameWindow.addEventListener("afterprint", cleanup, { once: true });
    frameWindow.focus();
    frameWindow.print();
  };

  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
}

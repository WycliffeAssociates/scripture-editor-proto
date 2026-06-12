/**
 * Dev-only DevTools console helpers, attached to `window.grab`.
 *
 * Motivation: inspecting elements in the Chrome DevTools Elements panel never
 * interferes with the app's menus/popovers (no page clicks), unlike in-page
 * toolbars. Select an element in DevTools (which sets `$0`) or focus one, then
 * call these from the console to get a pasteable description.
 *
 * Every function RETURNS a string, so the idiomatic use is to wrap it in
 * DevTools' built-in `copy()`:
 *
 *     copy(grab($0, "this padding bugs me"))      // el + your note
 *     copy(grab($0, "...note", { styles: true })) // el + styles + your note
 *     copy(grab.el($0))                  // selected element: selector + identity
 *     copy(grab.el($0, { styles: true })) // ...plus curated computed styles
 *     copy(grab.selector($0))            // selector path only
 *     copy(grab.focused())               // document.activeElement instead of $0
 *     copy(grab.tree($0))                // element + its descendant outline
 *     copy(grab.all([$0, $1]))           // several elements at once → one payload
 *
 * `copy()` exists only in the console, not page scope, so these helpers can't
 * call it themselves — they return the text for you to copy. Each call also
 * `console.log`s the block, so you can read/select it from the console even
 * without `copy()`. They deliberately do NOT use `navigator.clipboard`, which
 * rejects with NotAllowedError while DevTools (not the page) holds focus.
 *
 * Only imported under `import.meta.env.DEV` (see web/main.tsx); never ships to
 * production.
 */

export {}; // ensure this file is treated as a module (for `declare global`)

const MAX_SELECTOR_DEPTH = 8;
const MAX_TEXT_LEN = 80;

/** Build a reasonably-unique CSS selector path, preferring id / data-testid. */
function cssPath(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.nodeType === 1 && parts.length < MAX_SELECTOR_DEPTH) {
    if (node.id) {
      parts.unshift(`#${CSS.escape(node.id)}`);
      break; // ids are unique enough to anchor the path
    }
    let part = node.tagName.toLowerCase();
    const testId = node.getAttribute("data-testid");
    if (testId) {
      part += `[data-testid="${testId}"]`;
    } else {
      const parent = node.parentElement;
      if (parent) {
        const sameTag = Array.from(parent.children).filter(
          (c) => c.tagName === node?.tagName,
        );
        if (sameTag.length > 1) {
          part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
        }
      }
    }
    parts.unshift(part);
    node = node.parentElement;
  }
  return parts.join(" > ");
}

function textSnippet(el: Element): string {
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  return text.length > MAX_TEXT_LEN ? `${text.slice(0, MAX_TEXT_LEN)}…` : text;
}

/** One-line identity: tag, id, classes, all data-* attrs, role/aria, text. */
function identity(el: Element): string {
  const bits: string[] = [el.tagName.toLowerCase()];
  if (el.id) bits.push(`#${el.id}`);
  const cls = Array.from(el.classList);
  if (cls.length) bits.push(`.${cls.join(".")}`);
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.startsWith("data-")) {
      bits.push(`[${attr.name}="${attr.value}"]`);
    }
  }
  const role = el.getAttribute("role");
  if (role) bits.push(`[role="${role}"]`);
  const label = el.getAttribute("aria-label");
  if (label) bits.push(`[aria-label="${label}"]`);
  return bits.join("");
}

function resolve(el?: Element | null): Element | null {
  const target = el ?? document.activeElement;
  return target instanceof Element && target !== document.body ? target : null;
}

/** Curated, high-signal computed-style properties for layout/appearance work. */
const STYLE_PROPERTIES = [
  "display",
  "position",
  "box-sizing",
  "width",
  "height",
  "margin",
  "padding",
  "border",
  "border-radius",
  "flex",
  "flex-direction",
  "justify-content",
  "align-items",
  "gap",
  "grid-template-columns",
  "font",
  "font-size",
  "font-weight",
  "line-height",
  "color",
  "background",
  "opacity",
  "transform",
  "z-index",
  "overflow",
] as const;

function elBlock(el: Element): string {
  return [
    `selector: ${cssPath(el)}`,
    `element:  ${identity(el)}`,
    `text:     ${textSnippet(el)}`,
  ].join("\n");
}

/** Curated computed styles as a printable block. */
function stylesBlock(el: Element): string {
  const computed = getComputedStyle(el);
  const lines = STYLE_PROPERTIES.map(
    (prop) => `  ${prop}: ${computed.getPropertyValue(prop)};`,
  );
  return ["computed styles:", ...lines].join("\n");
}

interface GrabOptions {
  /** Append the element's curated computed styles. */
  styles?: boolean;
}

/** Append a free-form user comment block, if one was given. */
function withComment(text: string, comment?: string): string {
  const trimmed = comment?.trim();
  return trimmed ? `${text}\n\ncomment: ${trimmed}` : text;
}

/**
 * Log the text and return it. Logging means a bare `grab.el($0)` prints a
 * copyable block; returning means `copy(grab.el($0))` still works. We don't
 * touch `navigator.clipboard` here — it rejects with NotAllowedError whenever
 * DevTools (not the page) holds focus, which is exactly when these run.
 */
function report(text: string): string {
  console.log(text);
  return text;
}

/**
 * Shared `(el, comment?, opts?)` parsing for the element grabbers. The comment
 * comes first because annotating is the common case; the middle arg may instead
 * be the options object (`grab($0, { styles: true })`) when you only want styles
 * and no note. Returns the trimmed comment and resolved options.
 */
function parseArgs(
  commentOrOpts?: string | GrabOptions,
  opts?: GrabOptions,
): { note?: string; options: GrabOptions } {
  return typeof commentOrOpts === "string"
    ? { note: commentOrOpts, options: opts ?? {} }
    : { note: undefined, options: commentOrOpts ?? {} };
}

/**
 * Callable form: `grab($0, "this padding bugs me")`, plus options third when you
 * also want styles: `grab($0, "...note", { styles: true })`. Same payload as
 * `grab.el`, with the comment appended after the block.
 */
function grabFn(
  el?: Element | null,
  commentOrOpts?: string | GrabOptions,
  opts?: GrabOptions,
): string {
  const { note, options } = parseArgs(commentOrOpts, opts);
  const target = resolve(el);
  if (!target) return report("(no element)");
  const out = options.styles
    ? `${elBlock(target)}\n\n${stylesBlock(target)}`
    : elBlock(target);
  return report(withComment(out, note));
}

const grab = Object.assign(grabFn, {
  /**
   * Selector path. `(el, comment?, opts?)`: a string second arg is your note,
   * `{ styles: true }` (second or third) appends computed styles.
   */
  selector(
    el?: Element | null,
    commentOrOpts?: string | GrabOptions,
    opts?: GrabOptions,
  ): string {
    const { note, options } = parseArgs(commentOrOpts, opts);
    const target = resolve(el);
    if (!target) return report("(no element)");
    const out = options.styles
      ? `${cssPath(target)}\n\n${stylesBlock(target)}`
      : cssPath(target);
    return report(withComment(out, note));
  },

  /**
   * Selector + identity + text for one element. `(el, comment?, opts?)`: a
   * string second arg is your note, `{ styles: true }` appends computed styles.
   */
  el(
    el?: Element | null,
    commentOrOpts?: string | GrabOptions,
    opts?: GrabOptions,
  ): string {
    const { note, options } = parseArgs(commentOrOpts, opts);
    const target = resolve(el);
    if (!target) return report("(no element)");
    const out = options.styles
      ? `${elBlock(target)}\n\n${stylesBlock(target)}`
      : elBlock(target);
    return report(withComment(out, note));
  },

  /** Same as el() but defaults to document.activeElement. */
  focused(commentOrOpts?: string | GrabOptions, opts?: GrabOptions): string {
    return this.el(document.activeElement, commentOrOpts, opts);
  },

  /** Element plus a depth-limited outline of its descendants. */
  tree(el?: Element | null, maxDepth = 3): string {
    const target = resolve(el);
    if (!target) return report("(no element)");
    const lines: string[] = [elBlock(target), "", "tree:"];
    const walk = (node: Element, depth: number) => {
      lines.push(`${"  ".repeat(depth)}${identity(node)}`);
      if (depth >= maxDepth) return;
      for (const child of Array.from(node.children)) {
        walk(child, depth + 1);
      }
    };
    walk(target, 0);
    return report(lines.join("\n"));
  },

  /** Several elements → one payload, divided for readability. */
  all(elements: Array<Element | null>, opts: GrabOptions = {}): string {
    const blocks = elements
      .map((el) => resolve(el))
      .filter((el): el is Element => el !== null)
      .map((el) =>
        opts.styles ? `${elBlock(el)}\n\n${stylesBlock(el)}` : elBlock(el),
      );
    return report(blocks.join("\n\n---\n\n"));
  },
});

declare global {
  interface Window {
    grab: typeof grab;
  }
}

window.grab = grab;
console.info(
  '[grab] DevTools helpers ready — all take (el, comment?, opts?): grab($0, "note"), grab.el($0, "note", { styles: true }), grab.focused("note"), grab.selector($0), grab.tree($0), grab.all([$0,$1]). Wrap in copy(): copy(grab.focused("this padding bugs me"))',
);

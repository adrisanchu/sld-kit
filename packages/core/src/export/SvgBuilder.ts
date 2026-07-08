export type SvgAttrValue = string | number | undefined;
export type SvgAttrs = Record<string, SvgAttrValue>;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatAttrs(attrs: SvgAttrs): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    const str = typeof value === 'number' ? String(Math.round(value * 100) / 100) : value;
    parts.push(`${key}="${escapeXml(str)}"`);
  }
  return parts.length ? ' ' + parts.join(' ') : '';
}

/**
 * Minimal DOM-free SVG string builder. Runs anywhere (Node scripts, web
 * workers, browser) because it never touches `document`. All attribute
 * values and text content are XML-escaped.
 */
export class SvgBuilder {
  private parts: string[] = [];
  private openTags: string[] = [];

  /** Self-closing element: `<tag …/>`. */
  element(tag: string, attrs: SvgAttrs = {}): this {
    this.parts.push(`<${tag}${formatAttrs(attrs)}/>`);
    return this;
  }

  /** Element with escaped text content: `<tag …>text</tag>`. */
  textElement(tag: string, attrs: SvgAttrs, text: string): this {
    this.parts.push(`<${tag}${formatAttrs(attrs)}>${escapeXml(text)}</${tag}>`);
    return this;
  }

  open(tag: string, attrs: SvgAttrs = {}): this {
    this.parts.push(`<${tag}${formatAttrs(attrs)}>`);
    this.openTags.push(tag);
    return this;
  }

  close(): this {
    const tag = this.openTags.pop();
    if (tag) this.parts.push(`</${tag}>`);
    return this;
  }

  toString(): string {
    return this.parts.join('\n');
  }
}

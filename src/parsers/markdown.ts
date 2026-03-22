export interface HeadingInfo {
  level: number;
  text: string;
  slug: string;
  startLine: number;
  endLine: number;
  content: string;
}

/**
 * @deprecated Use HeadingInfo instead.
 */
export interface HeadingEntry {
  level: number;
  text: string;
  content: string;
}

/**
 * Generate a URL-safe slug from heading text.
 *
 * Lowercases, replaces spaces with hyphens, strips characters that are not
 * alphanumeric or hyphens, and collapses consecutive hyphens into one.
 */
export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Extract ATX-style headings from a Markdown string.
 *
 * Returns an array of HeadingInfo objects in document order with computed
 * slug and line boundaries. Only recognizes ATX-style headings (lines
 * starting with one or more `#` characters followed by a space).
 *
 * This is a pure function — no I/O, no side effects.
 */
export function extractHeadings(markdown: string): HeadingInfo[] {
  if (markdown === '') {
    return [];
  }

  const lines = markdown.split('\n');

  // Determine effective total lines: exclude a single trailing empty line
  // so that endLine for the last heading doesn't count it.
  const totalLines = lines.length > 0 && lines[lines.length - 1] === ''
    ? lines.length - 1
    : lines.length;

  const headings: HeadingInfo[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      const slug = generateSlug(text);
      const startLine = i + 1; // 1-based

      // Collect content lines until the next heading
      const contentLines: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        if (/^#{1,6}\s+/.test(lines[j])) break;
        contentLines.push(lines[j]);
      }
      const content = contentLines.join('\n').trim();

      headings.push({ level, text, slug, startLine, endLine: 0, content });
    }
  }

  // Compute endLine for each heading
  for (let i = 0; i < headings.length; i++) {
    if (i + 1 < headings.length) {
      headings[i].endLine = headings[i + 1].startLine - 1;
    } else {
      headings[i].endLine = totalLines;
    }
  }

  return headings;
}

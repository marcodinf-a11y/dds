export interface HeadingEntry {
  level: number;
  text: string;
  content: string;
}

export function extractHeadings(markdown: string): HeadingEntry[] {
  const lines = markdown.split('\n');
  const headings: HeadingEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      const contentLines: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        if (/^#{1,6}\s+/.test(lines[j])) break;
        contentLines.push(lines[j]);
      }
      headings.push({ level, text, content: contentLines.join('\n').trim() });
    }
  }

  return headings;
}

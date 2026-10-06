import Link from 'next/link';
import type { Route } from 'next';
import { Fragment } from 'react';

/**
 * A deliberately small Markdown renderer for admin-written pages:
 * `#`/`##`/`###` headings, paragraphs, `-` and `1.` lists, `> ` quotes,
 * `**bold**`, `*italic*` and `[links](/path)`.
 *
 * It builds React elements — never HTML strings — so anything an admin types
 * is shown as text, and links are limited to site paths and http(s)/mailto/tel.
 */
export function Markdown({ source }: { source: string }) {
  const blocks = parseBlocks(source);
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-ink-hi">
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'h1':
            return <h2 key={index} className="pt-2 font-display text-2xl font-bold tracking-tight text-ink">{inline(block.text)}</h2>;
          case 'h2':
            return <h2 key={index} className="pt-2 font-display text-xl font-bold tracking-tight text-ink">{inline(block.text)}</h2>;
          case 'h3':
            return <h3 key={index} className="pt-1 font-display text-lg font-semibold tracking-tight text-ink">{inline(block.text)}</h3>;
          case 'ul':
            return (
              <ul key={index} className="list-disc space-y-1.5 pl-5 marker:text-accent">
                {block.items.map((item, i) => <li key={i}>{inline(item)}</li>)}
              </ul>
            );
          case 'ol':
            return (
              <ol key={index} className="list-decimal space-y-1.5 pl-5 marker:font-semibold marker:text-accent">
                {block.items.map((item, i) => <li key={i}>{inline(item)}</li>)}
              </ol>
            );
          case 'quote':
            return (
              <blockquote key={index} className="border-l-4 border-accent-border bg-accent-soft px-4 py-2 text-ink-muted">
                {inline(block.text)}
              </blockquote>
            );
          default:
            return <p key={index}>{inline(block.text)}</p>;
        }
      })}
    </div>
  );
}

type Block =
  | { type: 'h1' | 'h2' | 'h3' | 'p' | 'quote'; text: string }
  | { type: 'ul' | 'ol'; items: string[] };

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let paragraph: string[] = [];
  let list: Block | null = null;

  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'p', text: paragraph.join(' ') });
    paragraph = [];
    if (list) blocks.push(list);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: (['h1', 'h2', 'h3'] as const)[heading[1]!.length - 1]!, text: heading[2]! });
    } else if (bullet || numbered) {
      const type = bullet ? 'ul' : 'ol';
      if (paragraph.length) {
        blocks.push({ type: 'p', text: paragraph.join(' ') });
        paragraph = [];
      }
      if (!list || list.type !== type) {
        if (list) blocks.push(list);
        list = { type, items: [] };
      }
      (list as { items: string[] }).items.push((bullet ?? numbered)![1]!);
    } else if (line.startsWith('> ')) {
      flush();
      blocks.push({ type: 'quote', text: line.slice(2) });
    } else {
      if (list) {
        blocks.push(list);
        list = null;
      }
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

const SAFE_HREF = /^(\/(?!\/)|#|https?:\/\/|mailto:|tel:)/i;

/** **bold**, *italic*, [label](href) — everything else is literal text. */
function inline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1] !== undefined) parts.push(<strong key={key++} className="font-semibold text-ink">{match[1]}</strong>);
    else if (match[2] !== undefined) parts.push(<em key={key++}>{match[2]}</em>);
    else {
      const [label, href] = [match[3]!, match[4]!];
      if (!SAFE_HREF.test(href)) parts.push(label);
      else if (href.startsWith('/')) {
        parts.push(<Link key={key++} href={href as Route} className="font-medium text-accent-label underline-offset-2 hover:underline">{label}</Link>);
      } else {
        parts.push(
          <a key={key++} href={href} className="font-medium text-accent-label underline-offset-2 hover:underline"
            {...(/^https?:/i.test(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
            {label}
          </a>,
        );
      }
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.map((part, i) => <Fragment key={i}>{part}</Fragment>);
}

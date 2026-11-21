/**
 * Tiny markdown renderer (B-09): ## / ### headings, - bullets, **bold**, paragraphs. No library.
 * Sentences listed in `highlight` get an amber background (fact-guard "unverified").
 */
import { Fragment, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { colors, font } from '../../lib/theme';

const AMBER = '#FFE2A8';

function bold(text: string, keyBase: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <Text key={`${keyBase}-b${i}`} style={{ fontWeight: '800' }}>{part.slice(2, -2)}</Text>
    ) : (
      <Text key={`${keyBase}-t${i}`}>{part}</Text>
    ),
  );
}

/** Split a line into normal / highlighted runs, then apply **bold** inside each run. */
function inline(text: string, highlight: string[], keyBase: string): ReactNode[] {
  const hs = highlight.map((h) => h.trim()).filter((h) => h.length > 3);
  if (!hs.length) return bold(text, keyBase);
  const out: ReactNode[] = [];
  let rest = text;
  let n = 0;
  while (rest.length) {
    let best: { at: number; len: number } | null = null;
    for (const h of hs) {
      // match ignoring markdown bold markers
      const at = rest.replace(/\*\*/g, '').indexOf(h.replace(/\*\*/g, ''));
      if (at >= 0 && (!best || at < best.at)) best = { at, len: h.replace(/\*\*/g, '').length };
    }
    if (!best) {
      out.push(...bold(rest, `${keyBase}-${n++}`));
      break;
    }
    // positions were computed on the bold-stripped string; work on that plain string from here
    const plain = rest.replace(/\*\*/g, '');
    if (best.at > 0) out.push(...bold(plain.slice(0, best.at), `${keyBase}-${n++}`));
    out.push(
      <Text key={`${keyBase}-h${n++}`} style={{ backgroundColor: AMBER }} accessibilityLabel={`Unverified: ${plain.slice(best.at, best.at + best.len)}`}>
        {plain.slice(best.at, best.at + best.len)}
      </Text>,
    );
    rest = plain.slice(best.at + best.len);
  }
  return out;
}

export function MarkdownLite({ text, highlight = [] }: { text: string; highlight?: string[] }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  const flush = (k: number) => {
    if (!para.length) return;
    const t = para.join(' ');
    blocks.push(<Text key={`p${k}`} style={{ fontSize: font.md, color: colors.text, lineHeight: 24 }}>{inline(t, highlight, `p${k}`)}</Text>);
    para = [];
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const b = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (!line.trim()) return flush(i);
    if (h) {
      flush(i);
      const level = h[1]!.length;
      blocks.push(
        <Text key={`h${i}`} accessibilityRole="header" style={{ fontSize: level <= 2 ? font.xl : font.lg, fontWeight: '800', color: colors.brown, marginTop: 6 }}>
          {inline(h[2]!, highlight, `h${i}`)}
        </Text>,
      );
      return;
    }
    if (b) {
      flush(i);
      blocks.push(
        <View key={`b${i}`} style={{ flexDirection: 'row', gap: 8, paddingLeft: 4 }}>
          <Text style={{ fontSize: font.md, color: colors.orange, lineHeight: 24 }}>•</Text>
          <Text style={{ flex: 1, fontSize: font.md, color: colors.text, lineHeight: 24 }}>{inline(b[1]!, highlight, `b${i}`)}</Text>
        </View>,
      );
      return;
    }
    para.push(line.trim());
  });
  flush(lines.length);
  return <View style={{ gap: 8 }}>{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</View>;
}

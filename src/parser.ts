import { fromMarkdown } from 'mdast-util-from-markdown';
import { mdxjs } from 'micromark-extension-mdxjs';
import { mdxFromMarkdown } from 'mdast-util-mdx';
import { gfmStrikethrough } from 'micromark-extension-gfm-strikethrough';
import { gfmStrikethroughFromMarkdown } from 'mdast-util-gfm-strikethrough';
import type { RootContent } from 'mdast';

export type Style = 'bold' | 'italic' | 'strike' | 'link' | 'image';
export interface Span { start: number; end: number; style: Style }
type Node = RootContent & { children?: Node[] };
const options = {
  extensions: [mdxjs(), gfmStrikethrough({ singleTilde: false })],
  mdastExtensions: [mdxFromMarkdown(), gfmStrikethroughFromMarkdown()]
};

/** UTF-16 offsets, matching VS Code's positionAt. Never evaluates MDX. */
export function parseSpans(source: string): Span[] {
  let tree;
  try { tree = fromMarkdown(source, options); } catch { return []; }
  const spans: Span[] = [];
  function add(node: Node, style: Style, trim = 0) {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start !== undefined && end !== undefined && end - trim > start + trim)
      spans.push({ start: start + trim, end: end - trim, style });
  }
  function visit(node: Node, inherited?: Style, insideBold = false) {
    // Literal code, JS expressions, JSX attributes and ESM are opaque.
    if (['code', 'inlineCode', 'mdxFlowExpression', 'mdxTextExpression', 'mdxjsEsm'].includes(node.type)) return;
    if (node.type === 'strong') add(node, 'bold', 2);
    if (node.type === 'emphasis') add(node, 'italic', 1);
    if (node.type === 'delete') add(node, 'strike', 2);
    if (node.type === 'definition') { add(node, 'link'); return; }
    if (node.type === 'image' || node.type === 'imageReference') {
      // The parser validates the construct; only locate the source alt delimiters.
      const start = node.position!.start.offset!;
      const end = node.position!.end.offset!;
      let depth = 1;
      for (let i = start + 2; i < end; i++) {
        if (source[i] === '\\') { i++; continue; }
        if (source[i] === '[') depth++;
        if (source[i] === ']' && --depth === 0) {
          if (i > start + 2) spans.push({ start: start + 2, end: i, style: 'image' });
          break;
        }
        if (source[i] !== ']') continue;
      }
      return;
    }
    const color = node.type === 'link' || node.type === 'linkReference' ? 'link' : inherited;
    insideBold ||= node.type === 'strong';
    if (node.type === 'text' && color && !insideBold) add(node, color);
    for (const child of node.children ?? []) visit(child, color, insideBold);
  }
  for (const child of tree.children) visit(child as Node);
  return spans;
}

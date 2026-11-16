import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSpans, type Style } from '../src/parser';
const texts = (source: string, style: Style) => parseSpans(source)
  .filter(s => s.style === style).map(s => source.slice(s.start, s.end));

test('both delimiters, nested emphasis, strike, no single tilde', () => {
  const s = '**粗体** __bold__ *斜体* _italic_ ~~删除~~ ~plain~ **outer *inner***';
  assert.deepEqual(texts(s, 'bold'), ['粗体', 'bold', 'outer *inner*']);
  assert.deepEqual(texts(s, 'italic'), ['斜体', 'italic', 'inner']);
  assert.deepEqual(texts(s, 'strike'), ['删除']);
});
test('link colors yield to bold, retain italic and encoded source', () => {
  const s = '[normal **bold** *italic* &amp;](https://example.com)';
  assert.deepEqual(texts(s, 'bold'), ['bold']);
  assert.deepEqual(texts(s, 'italic'), ['italic']);
  assert.equal(texts(s, 'link').join('').includes('bold'), false);
  assert.ok(texts(s, 'link').join('').includes('&amp;'));
});
test('resolved references, collapsed/shortcut, images and definitions', () => {
  const s = '[link][ref] [ref][] [ref] ![alt][ref] ![x\\]y](https://a/x.png)\n\n[ref]: https://example.com "title"';
  assert.deepEqual(texts(s, 'image'), ['alt', 'x\\]y']);
  assert.deepEqual(texts(s, 'link'), ['link', 'ref', 'ref', '[ref]: https://example.com "title"']);
  assert.deepEqual(parseSpans('[missing][unknown]'), []);
});
test('MDX children styled, attributes expressions ESM and code opaque', () => {
  const s = 'import X from "**module**"\n\n<Details title="**attribute**">\n**yes**和[link](https://a)\n\n{ "**expression**" }\n\n`**code**`\n\n~~~js\n**fenced**\n~~~\n</Details>';
  assert.deepEqual(texts(s, 'bold'), ['yes']);
  assert.deepEqual(texts(s, 'link'), ['link']);
});
test('inline JSX and expressions, escapes, CRLF, UTF16', () => {
  const s = '😀\r\n<Badge value={"**no**"}>**好**</Badge> \\*escaped* {1 + 2}';
  assert.deepEqual(texts(s, 'bold'), ['好']);
  assert.deepEqual(texts(s, 'italic'), []);
});
test('editing recomputes offsets and removes old ranges, invalid MDX clears', () => {
  const before = '**old**';
  assert.deepEqual(parseSpans(before), [{ start: 2, end: 5, style: 'bold' }]);
  assert.deepEqual(parseSpans('😀 ' + before), [{ start: 5, end: 8, style: 'bold' }]);
  assert.deepEqual(parseSpans('plain'), []);
  assert.deepEqual(parseSpans('<Details>\n**yes**'), []);
  assert.deepEqual(parseSpans('{ unfinished'), []);
});
test('image bracket nesting and empty description', () => {
  assert.deepEqual(texts('![a [b] c](a.png) ![](b.png)', 'image'), ['a [b] c']);
});
import './lifecycle';

import { visibleSpans } from '../src/viewport';
test('viewport clips multiline spans, merges buffers and excludes folded gaps', () => {
  const spans = [
    { start: 0, end: 1000, style: 'bold' as const },
    { start: 200, end: 210, style: 'link' as const },
    { start: 800, end: 810, style: 'image' as const }
  ];
  assert.deepEqual(visibleSpans(spans, [{start: 100, end: 250}, {start: 200, end: 300}, {start: 700, end: 850}]), [
    {start: 100, end: 300, style: 'bold'},
    {start: 200, end: 210, style: 'link'},
    {start: 700, end: 850, style: 'bold'},
    {start: 800, end: 810, style: 'image'}
  ]);
  assert.deepEqual(visibleSpans(spans, []), []);
});

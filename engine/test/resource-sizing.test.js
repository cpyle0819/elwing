import test from 'node:test';
import assert from 'node:assert/strict';
import { nodeWidth, nodeHeight, sizeGroups } from '../diagram/groups.js';
import { wrapResourceText, MAX_AUTO_HEIGHT } from '../diagram/resource-sizing.js';
import { validateDocument, compactLayout } from '../diagram/model.js';
import { createDiagramRenderer } from '../render/svg-renderer.js';

const resource = { id: 'a', service: 'lambda', name: 'Worker', x: 0, y: 0 };
const graph = (nodes) => ({ version: 1, title: 'Sizing', nodes, edges: [] });

// Short descriptions retain the default size; long descriptions grow only to the automatic cap.
test('automatic card height follows wrapped text with a bounded maximum', () => {
  assert.equal(nodeWidth(resource), 164);
  assert.equal(nodeHeight(resource), 96);
  assert.ok(nodeHeight({ ...resource, name: 'A longer resource description '.repeat(4) }) > 96);
  assert.equal(
    nodeHeight({ ...resource, name: 'A long description '.repeat(50) }),
    MAX_AUTO_HEIGHT,
  );
  assert.equal(nodeHeight({ ...resource, height: 400 }), 400);
});

// Long unbroken words and explicit line breaks retain every non-whitespace character.
test('wrapping preserves text and uses the available card width', () => {
  const text = 'W'.repeat(75) + '\nA second paragraph';
  const narrow = wrapResourceText(text, 164);
  assert.equal(narrow.join('').replace(/\s/g, ''), text.replace(/\s/g, ''));
  assert.ok(narrow.length > wrapResourceText(text, 320).length);
  assert.deepEqual(wrapResourceText('First\n\nThird'), ['First', '', 'Third']);
});

// Imported manual sizes and long descriptions survive validation; invalid dimensions cannot enter storage.
test('validation accepts bounded resource sizes and longer text', () => {
  const doc = graph([{ ...resource, name: 'x'.repeat(1000), width: 320, height: 400 }]);
  assert.deepEqual(validateDocument(doc, ['lambda']), doc);
  for (const invalid of [
    { width: 163 },
    { height: 801 },
    { width: Infinity },
    { name: 'x'.repeat(1001) },
  ])
    assert.throws(() => validateDocument(graph([{ ...resource, ...invalid }]), ['lambda']));
});

// Group borders and compact rows leave clearance around the actual resource bounds.
test('groups and mobile layout account for resized cards', () => {
  const doc = graph([
    { id: 'g', service: 'group', name: 'System', x: 0, y: 0 },
    { ...resource, groupId: 'g', width: 320, height: 300 },
  ]);
  sizeGroups(doc);
  const group = doc.nodes[0];
  assert.ok(group.x + group.width > resource.x + 320);
  assert.ok(group.y + group.height > resource.y + 300);
  const compact = compactLayout(
    graph([
      { ...resource, width: 320, height: 300 },
      { ...resource, id: 'b' },
    ]),
  );
  const [first, second] = [...compact.nodes].sort((a, b) => a.y - b.y);
  assert.ok(second.y >= first.y + nodeHeight(first));
});

// Text changes invalidate route geometry, and exports include the same card size without interactive handles.
test('renderer routes and exports use expanded dimensions', () => {
  const renderer = createDiagramRenderer({ serviceLabel: () => 'Lambda' });
  const doc = graph([{ ...resource }]);
  const before = renderer.bounds(doc);
  doc.nodes[0].name = 'Longer resource description '.repeat(20);
  const after = renderer.bounds(doc);
  assert.ok(after.maxY > before.maxY);
  const markup = renderer.render(doc, { exporting: true, iconData: { lambda: '' } });
  assert.match(markup, /height="256"/);
  assert.doesNotMatch(markup, /data-resize-resource/);
});

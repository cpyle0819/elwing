import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDocument } from '../diagram/model.js';
const icon =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX2kAAAAASUVORK5CYII=';
const node = {
  id: 'box',
  service: 'custom',
  resourceName: 'Partner',
  name: 'Order review',
  icon,
  x: 10,
  y: 20,
};
// Imports accept bounded embedded PNG icons only, keeping remote URLs and active SVG content out of documents.
test('custom icon imports validate type, size, and resource kind', () => {
  const doc = { version: 1, title: 'Custom', nodes: [node], edges: [] };
  assert.deepEqual(validateDocument(doc, []), doc);
  for (const invalid of [
    'https://example.com/icon.png',
    'data:image/svg+xml,<svg/>',
    'data:image/png;base64,broken',
    icon + 'A'.repeat(100000),
    {},
  ]) {
    assert.throws(
      () => validateDocument({ ...doc, nodes: [{ ...node, icon: invalid }] }, []),
      /icon/,
    );
  }
  assert.throws(
    () => validateDocument({ ...doc, nodes: [{ ...node, service: 'lambda' }] }, ['lambda']),
    /icon/,
  );
});

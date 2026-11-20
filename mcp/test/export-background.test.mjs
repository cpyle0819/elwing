import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { buildRouter, exportBackground } from '../dist/tools.js';
import { createExporter } from '../dist/render.js';
import { localFixture } from './local-fixture.mjs';

// The first pixel of a PNG row is unaffected by every filter type, so the
// top-left RGBA can be read straight from the inflated image data.
function cornerPixel(png) {
  assert.equal(png.readUInt8(25), 6, 'RGBA colour type');
  const chunks = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('latin1', offset + 4, offset + 8) === 'IDAT')
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  return [...inflateSync(Buffer.concat(chunks)).subarray(1, 5)];
}

async function setup(t) {
  const { store, owner } = await localFixture(t);
  const server = buildRouter(owner, { store, exporter: createExporter() });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const client = new Client({ name: 'export-background', version: '1' });
  await client.connect(a);
  t.after(async () => {
    await client.close();
    await server.close();
  });
  const call = (name, args) => client.callTool({ name: `elwing_${name}`, arguments: args });
  const { diagramId } = (
    await call('create_diagram', { title: 'Backgrounds', mutationId: crypto.randomUUID() })
  ).structuredContent;
  await call('apply_diagram_changes', {
    diagramId,
    expectedRevision: 1,
    mutationId: crypto.randomUUID(),
    operations: [{ op: 'upsert_node', id: 'worker', service: 'lambda', name: 'Worker' }],
  });
  const exportAs = async (format, background) => {
    const result = await call('export_diagram', {
      diagramId,
      format,
      ...(background === undefined ? {} : { background }),
    });
    assert.ok(!result.isError, JSON.stringify(result));
    const { resource } = result.content.find((item) => item.type === 'resource');
    return { result, resource };
  };
  return { call, diagramId, exportAs };
}

test('PNG export is transparent by default and opaque in a requested colour', async (t) => {
  const { exportAs } = await setup(t);
  const plain = await exportAs('png');
  assert.equal(plain.result.structuredContent.background, 'transparent');
  assert.equal(cornerPixel(Buffer.from(plain.resource.blob, 'base64'))[3], 0);
  const coloured = await exportAs('png', '#F2F3F3');
  assert.equal(coloured.result.structuredContent.background, '#f2f3f3');
  assert.deepEqual(
    cornerPixel(Buffer.from(coloured.resource.blob, 'base64')),
    [242, 243, 243, 255],
  );
  assert.equal(JSON.parse(coloured.result.content[0].text).background, '#f2f3f3');
});

test('SVG and Excalidraw exports honour the background setting', async (t) => {
  const { exportAs } = await setup(t);
  const svg = (await exportAs('svg')).resource.text;
  assert.doesNotMatch(svg, /#f7f5ef/);
  assert.match((await exportAs('svg', '#fff')).resource.text, /<rect [^>]*fill="#ffffff"\/>/);
  const scene = JSON.parse((await exportAs('excalidraw', '#123456')).resource.text);
  assert.equal(scene.appState.viewBackgroundColor, '#123456');
  const clear = JSON.parse((await exportAs('excalidraw')).resource.text);
  assert.equal(clear.appState.viewBackgroundColor, 'transparent');
});

test('invalid backgrounds are rejected before rendering', async (t) => {
  const { call, diagramId } = await setup(t);
  for (const background of ['white', '#12345', 'url(#x)', '']) {
    const response = await call('export_diagram', { diagramId, format: 'svg', background });
    assert.equal(response.isError, true, background);
  }
  assert.throws(
    () => exportBackground('white'),
    (e) => e.code === 'INVALID_ARGUMENT',
  );
  assert.equal(exportBackground(undefined), 'transparent');
  assert.equal(exportBackground(null), 'transparent');
});

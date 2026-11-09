import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const directory = await mkdtemp(join(tmpdir(), 'elwing-standalone-'));
async function connect() {
  const client = new Client({ name: 'standalone-check', version: '1.0.0' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [resolve(process.argv[2] || 'dist/stdio.js'), '--data-dir', directory],
      env: { PATH: process.env.PATH, HOME: directory, AWS_EC2_METADATA_DISABLED: 'true' },
      stderr: 'inherit',
    }),
  );
  return client;
}
let client;
try {
  client = await connect();
  assert.equal((await client.listTools()).tools.length, 9);
  const call = async (name, args = {}) => {
    const result = await client.callTool({ name: `elwing_${name}`, arguments: args });
    assert.ok(!result.isError, JSON.stringify(result));
    return result;
  };
  await call('readability_guide');
  await call('catalog', { service: 'lambda' });
  const made = (await call('create_diagram', { title: 'Standalone', mutationId: randomUUID() }))
    .structuredContent;
  const updated = (
    await call('apply_diagram_changes', {
      diagramId: made.diagramId,
      expectedRevision: 1,
      mutationId: randomUUID(),
      operations: [
        { op: 'upsert_node', id: 'worker', service: 'lambda', name: 'Handle request' },
        { op: 'arrange' },
      ],
    })
  ).structuredContent;
  await call('check_readability', { diagramId: made.diagramId });
  for (const format of ['svg', 'png', 'excalidraw']) {
    const result = await call('export_diagram', { diagramId: made.diagramId, format });
    assert.ok((await readFile(result.structuredContent.filePath)).length > 0);
  }
  await client.close();
  client = await connect();
  assert.equal((await call('list_diagrams')).structuredContent.items[0].diagramId, made.diagramId);
  await call('delete_diagram', {
    diagrams: [{ diagramId: made.diagramId, expectedRevision: updated.revision }],
    mutationId: randomUUID(),
  });
  assert.equal((await call('list_diagrams')).structuredContent.items.length, 0);
  console.log('Standalone stdio lifecycle and restart passed.');
} finally {
  await client?.close();
  await rm(directory, { recursive: true, force: true });
}

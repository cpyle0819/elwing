import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { localFixture } from './local-fixture.mjs';

test('stdio initializes without credentials, uses catalog IDs and saves all export formats', async (t) => {
  const { directory } = await localFixture(t);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [new URL('../dist/stdio.js', import.meta.url).pathname, '--data-dir', directory],
    env: { PATH: process.env.PATH, HOME: directory, AWS_EC2_METADATA_DISABLED: 'true' },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'local-smoke', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(transport);
  const tools = await client.listTools();
  assert.equal(tools.tools.length, 9);
  assert.match(client.getInstructions(), /Run locally over stdio as one user, without sign-in/);
  const call = async (name, args) => {
    const result = await client.callTool({ name: `elwing_${name}`, arguments: args });
    assert.ok(!result.isError, JSON.stringify(result));
    return result;
  };
  const made = (await call('create_diagram', { title: 'Local Lambda', mutationId: randomUUID() }))
    .structuredContent;
  await call('apply_diagram_changes', {
    diagramId: made.diagramId,
    expectedRevision: 1,
    mutationId: randomUUID(),
    operations: [{ op: 'upsert_node', id: 'worker', service: 'lambda', name: 'Worker' }],
  });
  for (const format of ['svg', 'png', 'excalidraw']) {
    const result = await call('export_diagram', { diagramId: made.diagramId, format });
    const exported = result.content.find((item) => item.type === 'resource');
    const bytes =
      format !== 'png'
        ? Buffer.from(exported.resource.text)
        : Buffer.from(exported.resource.blob, 'base64');
    assert.deepEqual(await readFile(result.structuredContent.filePath), bytes);
  }
});

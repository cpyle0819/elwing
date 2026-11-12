import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { buildRouter, toolDefinitions } from '../dist/tools.js';
import { createExporter } from '../dist/render.js';
import { localFixture } from './local-fixture.mjs';
import { exerciseOutputSchemas } from './output-contract.mjs';

async function connect(t, shared, owner) {
  const server = buildRouter(owner, { exporter: createExporter(), ...shared });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const client = new Client({ name: 'output-schemas', version: '1' });
  await client.connect(a);
  t.after(async () => {
    await client.close();
    await server.close();
  });
  return client;
}
const error = (response) => {
  assert.equal(response.isError, true);
  return response.structuredContent;
};

test('every local tool definition carries an object outputSchema', () => {
  assert.equal(toolDefinitions.length, 9);
  for (const definition of toolDefinitions)
    assert.equal(definition.outputSchema?.type, 'object', definition.name);
});

test('every local tool success validates against its advertised outputSchema', async (t) => {
  const { store, owner } = await localFixture(t);
  const client = await connect(t, { store, saveExport: store.saveExport.bind(store) }, owner);
  const exercised = await exerciseOutputSchemas(client);
  assert.equal(exercised.size, 9);
});

test('a corrupt local data file returns a generic error without parser text or contents', async (t) => {
  const { store, owner, directory } = await localFixture(t);
  const client = await connect(t, { store }, owner);
  const made = await store.create(owner, { title: 'Corrupt', mutationId: crypto.randomUUID() });
  await writeFile(join(directory, 'diagrams', made.diagramId, 'meta.json'), '{"secret-marker": ');
  const result = error(
    await client.callTool({
      name: 'elwing_get_diagram',
      arguments: { diagramId: made.diagramId },
    }),
  );
  assert.deepEqual(result, { code: 'UNAVAILABLE', message: 'A data file is unreadable.' });
});

test('unexpected exceptions return a fixed message instead of their text', async (t) => {
  const { owner } = await localFixture(t);
  const leaky = new Error('Unexpected token s in JSON at position 3: {"secret-marker"');
  const store = new Proxy(
    {},
    {
      get: () => async () => {
        throw leaky;
      },
    },
  );
  const client = await connect(t, { store }, owner);
  for (const [name, args] of [
    ['list_diagrams', {}],
    ['get_diagram', { diagramId: '123e4567-e89b-42d3-a456-426614174000' }],
  ]) {
    const response = await client.callTool({ name: `elwing_${name}`, arguments: args });
    assert.deepEqual(error(response), {
      code: 'INVALID_DIAGRAM',
      message: 'Request failed. Do not retry unchanged.',
    });
    assert.doesNotMatch(JSON.stringify(response), /secret-marker|Unexpected token/);
  }
});

test('engine validation messages still reach the client as INVALID_DIAGRAM', async (t) => {
  const { store, owner } = await localFixture(t);
  const client = await connect(t, { store }, owner);
  const result = error(
    await client.callTool({
      name: 'elwing_create_diagram',
      arguments: {
        title: 'Bad',
        mutationId: crypto.randomUUID(),
        document: { version: 1, title: 'Bad', nodes: [{ id: 'x' }], edges: [] },
      },
    }),
  );
  assert.equal(result.code, 'INVALID_DIAGRAM');
  assert.match(result.message, /Invalid/);
});

test('rendering failures return a fixed INVALID_DIAGRAM message', async (t) => {
  const { store, owner } = await localFixture(t);
  const leaky = async () => {
    throw new Error('resvg panic: <svg secret-marker');
  };
  const client = await connect(t, { store, exporter: leaky }, owner);
  const created = await client.callTool({
    name: 'elwing_create_diagram',
    arguments: { title: 'Render', mutationId: crypto.randomUUID() },
  });
  const { diagramId } = created.structuredContent;
  for (const format of ['svg', 'png', 'excalidraw']) {
    const response = await client.callTool({
      name: 'elwing_export_diagram',
      arguments: { diagramId, format },
    });
    assert.deepEqual(error(response), {
      code: 'INVALID_DIAGRAM',
      message: 'Diagram could not be rendered. Simplify or repair the diagram, then export again.',
    });
    assert.doesNotMatch(JSON.stringify(response), /secret-marker|resvg/);
  }
});

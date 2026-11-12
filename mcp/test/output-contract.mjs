import assert from 'node:assert/strict';
import { Ajv } from 'ajv';

// Calls every advertised tool successfully and checks each structuredContent against the
// outputSchema the server advertises. Returns the names of the tools exercised.
export async function exerciseOutputSchemas(client, extraCalls = {}) {
  const { tools } = await client.listTools();
  const ajv = new Ajv({ strict: false });
  const validators = new Map();
  for (const tool of tools) {
    assert.equal(tool.outputSchema?.type, 'object', `${tool.name} advertises an outputSchema`);
    validators.set(tool.name, ajv.compile(tool.outputSchema));
  }
  const exercised = new Set();
  const call = async (name, args = {}) => {
    const response = await client.callTool({ name: `elwing_${name}`, arguments: args });
    assert.notEqual(response.isError, true, `${name}: ${response.content?.[0]?.text}`);
    const validate = validators.get(`elwing_${name}`);
    // Round-trip through JSON to check exactly what a remote client receives.
    const structured = JSON.parse(JSON.stringify(response.structuredContent));
    assert.ok(validate(structured), `${name}: ${ajv.errorsText(validate.errors)}`);
    exercised.add(`elwing_${name}`);
    return structured;
  };
  const mutationId = () => crypto.randomUUID();
  await call('readability_guide');
  await call('catalog');
  await call('catalog', { query: 'Lambda' });
  await call('catalog', { service: 'lambda' });
  const made = await call('create_diagram', { title: 'Contract', mutationId: mutationId() });
  const applied = await call('apply_diagram_changes', {
    diagramId: made.diagramId,
    expectedRevision: made.revision,
    mutationId: mutationId(),
    operations: [
      { op: 'upsert_node', id: 'worker', service: 'lambda', name: 'Resize photos' },
      { op: 'upsert_node', id: 'bucket', service: 's3', name: 'Photo archive' },
      { op: 'upsert_edge', id: 'save', source: 'worker', target: 'bucket', verb: 'writes to' },
      { op: 'arrange' },
    ],
  });
  await call('list_diagrams', { limit: 1 });
  await call('list_diagrams');
  const got = await call('get_diagram', { diagramId: made.diagramId });
  assert.equal(got.geometry.length, 2);
  await call('check_readability', { diagramId: made.diagramId });
  for (const format of ['svg', 'png', 'excalidraw'])
    await call('export_diagram', { diagramId: made.diagramId, format });
  for (const [name, run] of Object.entries(extraCalls)) {
    await run((args) => call(name, args), made.diagramId);
  }
  const second = await call('create_diagram', { title: 'Second', mutationId: mutationId() });
  await call('delete_diagram', {
    diagramId: second.diagramId,
    expectedRevision: second.revision,
    mutationId: mutationId(),
  });
  await call('delete_diagram', {
    diagrams: [
      { diagramId: made.diagramId, expectedRevision: applied.revision },
      { diagramId: second.diagramId, expectedRevision: 1 },
    ],
    mutationId: mutationId(),
  });
  assert.deepEqual([...exercised].sort(), tools.map((tool) => tool.name).sort());
  return exercised;
}

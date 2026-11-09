import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export function storageContract(name, fixture) {
  const create = (title = 'Architecture') => ({ title, mutationId: randomUUID() });
  const target = (made) => ({ diagramId: made.diagramId, expectedRevision: made.revision });
  const rejects = (promise, code) => assert.rejects(promise, (error) => error.code === code);
  test(`${name}: create, apply, summaries, single delete and durable receipts`, async (t) => {
    const { store, owner } = await fixture(t);
    const args = create(),
      made = await store.create(owner, args);
    assert.deepEqual(await store.create(owner, args), made);
    await rejects(store.create(owner, { ...args, title: 'Other' }), 'MUTATION_REUSED');
    const edit = {
      ...target(made),
      mutationId: randomUUID(),
      operations: [{ op: 'upsert_node', id: 'worker', service: 'lambda', name: 'Worker' }],
    };
    assert.deepEqual(await store.apply(owner, edit), {
      diagramId: made.diagramId,
      revision: 2,
      changed: true,
      operationsApplied: 1,
    });
    assert.equal((await store.apply(owner, edit)).revision, 2);
    await rejects(store.apply(owner, { ...edit, operations: [] }), 'MUTATION_REUSED');
    await rejects(store.apply(owner, { ...edit, mutationId: randomUUID() }), 'CONFLICT');
    const noOp = { ...edit, expectedRevision: 2, mutationId: randomUUID(), operations: [] };
    assert.equal((await store.apply(owner, noOp)).changed, false);
    const record = await store.get(owner, made.diagramId);
    const { document, ...metadata } = record;
    assert.equal(document.nodes[0].service, 'lambda');
    assert.deepEqual((await store.list(owner)).items, [metadata]);
    assert.deepEqual(metadata.services, ['lambda']);
    const deletion = { ...target(made), expectedRevision: 2, mutationId: randomUUID() };
    await rejects(store.delete(owner, { ...deletion, expectedRevision: 1 }), 'CONFLICT');
    const result = await store.delete(owner, deletion);
    assert.deepEqual(result, { diagramId: made.diagramId, deleted: true });
    assert.deepEqual(await store.delete(owner, deletion), result);
    assert.deepEqual(await store.create(owner, args), made);
    await rejects(store.get(owner, made.diagramId), 'NOT_FOUND');
    await rejects(store.delete(owner, { ...deletion, mutationId: randomUUID() }), 'NOT_FOUND');
    assert.deepEqual((await store.list(owner)).items, []);
  });
  test(`${name}: ordered pagination, cursor ownership and input bounds`, async (t) => {
    const { store, owner } = await fixture(t);
    const made = [];
    for (let i = 0; i < 3; i++) made.push(await store.create(owner, create()));
    const first = await store.list(owner, 2),
      second = await store.list(owner, 2, first.nextCursor);
    assert.deepEqual(
      [...first.items, ...second.items].map((x) => x.diagramId),
      made.map((x) => x.diagramId).sort(),
    );
    assert.equal(second.nextCursor, undefined);
    const cursor = JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString());
    cursor.owner = 'OWNER#someone-else';
    for (const value of [
      'invalid',
      Buffer.from(JSON.stringify(cursor)).toString('base64url'),
      'x'.repeat(513),
    ])
      await rejects(store.list(owner, 2, value), 'INVALID_ARGUMENT');
    for (const limit of [0, -1, 101, 1.5])
      await rejects(store.list(owner, limit), 'INVALID_ARGUMENT');
    for (const id of ['../escape', 'invalid', made[0].diagramId.toUpperCase()])
      await rejects(store.get(owner, id), 'INVALID_ARGUMENT');
  });
  test(`${name}: mixed batch results, validation, replay and expiry`, async (t) => {
    let now = Date.now();
    const { store, owner } = await fixture(t, { now: () => now });
    const a = await store.create(owner, create()),
      b = await store.create(owner, create());
    const args = {
      diagrams: [
        target(a),
        { ...target(b), expectedRevision: 2 },
        { diagramId: randomUUID(), expectedRevision: 1 },
      ],
      mutationId: randomUUID(),
    };
    const result = await store.deleteMany(owner, args);
    assert.deepEqual(result, {
      results: [
        { diagramId: a.diagramId, status: 'deleted' },
        { diagramId: b.diagramId, status: 'conflict', currentRevision: 1 },
        { diagramId: args.diagrams[2].diagramId, status: 'not_found' },
      ],
      deletedCount: 1,
      conflictCount: 1,
      notFoundCount: 1,
    });
    assert.deepEqual(await store.deleteMany(owner, args), result);
    await rejects(store.deleteMany(owner, { ...args, diagrams: [target(b)] }), 'MUTATION_REUSED');
    for (const diagrams of [
      [],
      Array(51).fill(target(b)),
      [target(b), target(b)],
      [null],
      [{}],
      [{ ...target(b), expectedRevision: 0 }],
      [{ ...target(b), extra: true }],
    ])
      await rejects(
        store.deleteMany(owner, { diagrams, mutationId: randomUUID() }),
        'INVALID_ARGUMENT',
      );
    assert.equal((await store.list(owner)).items.length, 1);
    now += 86401000;
    assert.equal((await store.deleteMany(owner, args)).notFoundCount, 2);
  });
  test(`${name}: concurrent edits and diagram cap preserve state`, async (t) => {
    const { store, owner } = await fixture(t, { maxDiagrams: 2 });
    const made = await store.create(owner, create());
    const edits = await Promise.allSettled(
      ['First', 'Second'].map((title) =>
        store.apply(owner, {
          ...target(made),
          mutationId: randomUUID(),
          operations: [{ op: 'rename_diagram', title }],
        }),
      ),
    );
    assert.equal(edits.filter((x) => x.status === 'fulfilled').length, 1);
    const before = await store.get(owner, made.diagramId);
    await assert.rejects(
      store.apply(owner, {
        diagramId: made.diagramId,
        expectedRevision: 2,
        mutationId: randomUUID(),
        operations: [
          { op: 'rename_diagram', title: 'Bad edit' },
          { op: 'remove_node', id: 'missing' },
        ],
      }),
    );
    assert.deepEqual(await store.get(owner, made.diagramId), before);
    const creates = await Promise.allSettled(
      Array.from({ length: 4 }, () => store.create(owner, create())),
    );
    assert.equal(creates.filter((x) => x.status === 'fulfilled').length, 1);
    assert.equal((await store.list(owner)).items.length, 2);
  });
  test(`${name}: expired create receipt and full batch limit`, async (t) => {
    let now = Date.now();
    const { store, owner } = await fixture(t, { now: () => now });
    const args = create(),
      first = await store.create(owner, args);
    now += 86401000;
    const second = await store.create(owner, args);
    assert.notEqual(first.diagramId, second.diagramId);
    const made = [first, second];
    for (let i = 2; i < 50; i++) made.push(await store.create(owner, create()));
    const batch = { diagrams: made.map(target), mutationId: randomUUID() };
    const results = await Promise.all([
      store.deleteMany(owner, batch),
      store.deleteMany(owner, batch),
    ]);
    assert.equal(results[0].deletedCount, 50);
    assert.deepEqual(results[0], results[1]);
    assert.equal((await store.list(owner)).items.length, 0);
  });
}

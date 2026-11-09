const text = (maxLength = 100) => ({ type: 'string', minLength: 1, maxLength });
const object = (properties, required = Object.keys(properties)) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const coordinate = { type: 'number', minimum: -100000, maximum: 100000 };
const optionalId = { anyOf: [text(), { type: 'null' }] };
const operation = (op, properties, required = Object.keys(properties)) =>
  object({ op: { const: op }, ...properties }, ['op', ...required]);
export const operationsSchema = {
  type: 'array',
  maxItems: 1200,
  items: {
    oneOf: [
      operation(
        'upsert_node',
        {
          id: text(),
          service: text(),
          name: { type: 'string', maxLength: 1000 },
          resourceName: text(60),
          description: { type: 'string', maxLength: 1000 },
          x: coordinate,
          y: coordinate,
          width: { type: 'number', minimum: 164, maximum: 640 },
          height: { type: 'number', minimum: 96, maximum: 800 },
          groupId: optionalId,
          resourceType: optionalId,
        },
        ['id'],
      ),
      operation('remove_node', { id: text() }),
      operation(
        'upsert_edge',
        {
          id: text(),
          source: text(),
          target: text(),
          verb: text(240),
          label: text(240),
          sourceSide: { enum: ['auto', 'top', 'bottom', 'left', 'right'] },
          targetSide: { enum: ['auto', 'top', 'bottom', 'left', 'right'] },
        },
        ['id', 'source', 'target', 'verb'],
      ),
      operation('remove_edge', { id: text() }),
      operation('set_group', {
        id: text(),
        name: text(60),
        members: { type: 'array', items: text(), minItems: 1, maxItems: 199, uniqueItems: true },
      }),
      operation('move_group', { id: text(), x: coordinate, y: coordinate }),
      operation('rename_diagram', { title: text(80) }),
      operation('arrange', {}),
    ],
  },
};

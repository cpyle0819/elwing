import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { serviceIconUrl } from '../render/service-icons.js';
import { resourceTypes } from '../catalog/resource-types.js';

test('standard icons cover all services and resource types', () => {
  const catalog = JSON.parse(readFileSync(new URL('../catalog/services.json', import.meta.url)));
  for (const { id } of [...catalog, ...resourceTypes]) {
    assert.equal(serviceIconUrl(id), `icons/${id}.svg`);
    const svg = readFileSync(new URL('../catalog/' + serviceIconUrl(id), import.meta.url), 'utf8');
    assert.match(svg, /<svg/);
    assert.match(svg, /viewBox="[^"]+"/);
  }
  assert.equal(serviceIconUrl('custom'), 'icons/custom.svg');
  assert.equal(serviceIconUrl('group'), 'icons/group.svg');
  assert.equal(serviceIconUrl('lambda'), 'icons/lambda.svg');
  assert.equal(
    serviceIconUrl('res-aws-lambda-lambda-function'),
    'icons/res-aws-lambda-lambda-function.svg',
  );
});

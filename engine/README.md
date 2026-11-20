# Elwing engine

Elwing engine is a JavaScript library for AWS architecture diagrams. It validates diagram documents, applies atomic edits, arranges resources and groups, routes connections, checks readability, and exports SVG or editable Excalidraw scenes. Its catalog supplies AWS service IDs, resource types, icons, and documented relationships.

## Install

Use Node.js 22 or newer and install from a local copy of this directory:

```sh
npm install /path/to/engine
```

The package name is `elwing-diagram-engine`. It is not published to the npm registry, so install it from source as shown above. Runtime modules use JavaScript and Node built-ins. Import the named entry points below; the package has no root entry point.

## Create a diagram

Save this as `example.mjs` in the consuming project and run `node example.mjs`:

```js
import { catalogGraph } from 'elwing-diagram-engine/catalog/graph';
import { applyOperations } from 'elwing-diagram-engine/agent/operations';
import { checkReadability } from 'elwing-diagram-engine/agent/readability';

const serviceIds = catalogGraph().services.map(({ id }) => id);
const diagram = applyOperations(
  { version: 1, title: 'Photo processing', nodes: [], edges: [] },
  [
    { op: 'upsert_node', id: 'resize', service: 'lambda', name: 'Resize photos' },
    { op: 'upsert_node', id: 'photos', service: 's3', name: 'Photo archive' },
    {
      op: 'upsert_edge',
      id: 'save',
      source: 'resize',
      target: 'photos',
      verb: 'writes to',
    },
    { op: 'arrange' },
  ],
  serviceIds,
);

console.log(JSON.stringify({ diagram, findings: checkReadability(diagram) }, null, 2));
```

`applyOperations` clones its input and returns a validated document. If any operation or validation fails, it throws and leaves the input unchanged. The operations are `upsert_node`, `remove_node`, `upsert_edge`, `remove_edge`, `set_group`, `move_group`, `rename_diagram`, and `arrange`. Callers own persistence, concurrent-write checks, and retries.

## Main entry points

All import paths start with `elwing-diagram-engine/`.

| Entry point             | Main exports and purpose                                                                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `diagram/model`         | `validateDocument(document, serviceIds)` checks a version-1 document; `arrange(document)` positions its nodes. These functions can mutate the document.                                                                      |
| `agent/operations`      | `applyOperations(document, operations, serviceIds)` applies a complete edit batch to a copy.                                                                                                                                 |
| `agent/readability`     | `checkReadability(document)` returns findings with element IDs; `readabilityGuide` supplies design guidance.                                                                                                                 |
| `catalog/graph`         | `catalogGraph()` returns services, resource types, relationship triples, type approvals, and diagram primitives. `relationshipFeedback(source, verb, target)` returns an explanation for a rejected relationship, or `null`. |
| `catalog/relationships` | `allowedRelationships(sourceService, targetService)` and `allowedNodeRelationships(source, target)` list permitted verbs.                                                                                                    |
| `catalog/services`      | `createServiceCatalog(services)` builds a lookup; `serviceLabel(node, lookup)` supplies renderer labels.                                                                                                                     |
| `renderer`              | `createDiagramRenderer({ serviceLabel })` returns `render`, `bounds` and `routes` methods. `routes(document)` returns a defensive copy of the computed connector routes.                                                     |
| `image-export`          | `diagramSvg(document, renderer, options)` returns `{ svg, width, height }`; `boundedPngScale(width, height)` chooses a scale within raster size limits.                                                                      |
| `excalidraw-export`     | `diagramExcalidraw(document, renderer, { iconData, serviceLabel, updatedAt })` returns `{ text, width, height }`; `text` is a version-2 Excalidraw scene with embedded icons.                                                |
| `guidance/design-rules` | `designRules` contains architecture notation and design guidance.                                                                                                                                                            |

A document has `version: 1`, a `title`, `nodes`, and `edges`. Resources use exact catalog service IDs or `custom`; group nodes use `group`. A resource's optional `groupId` refers to one flat group. See [operation definitions](operations/operations-schema.js) and [model validation](diagram/model.js) for fields and bounds.

## Render and use assets

Read the service catalog through `import.meta.resolve('elwing-diagram-engine/services.json')`. Icon files resolve through `elwing-diagram-engine/assets/<id>.svg`. Pass a trusted map of icon IDs to image data URLs as the renderer's `iconData` option. The renderer accepts a `serviceLabel` callback for resource labels.

`diagramSvg` clones the document, computes bounds, and adds the SVG frame and title. The renderer's own `render`, `bounds` and `routes` methods can update group geometry. PNG encoding requires a rasterizer supplied by the consuming application; `boundedPngScale` supplies the size calculation only.

`diagramExcalidraw` also clones the document and reuses the same routes and bounds. Supply the saved revision's ISO timestamp as `updatedAt` for deterministic element/file timestamps; omitted or invalid timestamps use zero. Each card is a movable group; arrows bind to its rectangle. Excalidraw uses its own sans-serif font, horizontal arrow labels and sharp bends without crossing gaps. Moving cards may require tidying arrow bends. Group containers move independently of their member cards.

The [relationship catalog](docs/relationships.md) records evidence and scope for each connection. Missing coverage does not establish that an AWS integration is impossible. The catalog's review dates matter when evaluating service availability. [NOTICE.md](NOTICE.md) records artwork and catalog provenance.

## Develop

From this directory:

```sh
npm ci
npm test
```

Tests run after Prettier and ESLint checks. [Catalog maintenance](catalog-sources/README.md) documents the source records and generators.

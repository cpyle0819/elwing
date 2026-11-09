# Maintain the relationship catalog

The source records describe documented AWS operations and the limits of each claim. Missing documentation does not prove that an integration is impossible.

| Source                          | Content                                                                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `service-events.json`           | EventBridge service identifiers, direct event names, delivery guarantees, CloudTrail support, and evidence URLs.                                     |
| `additional-relationships.json` | Data, compute, networking, configuration, and local software relationships, with operation, scope, primary evidence, API reference, and review date. |
| `service-exclusions.json`       | Retirement notices and offerings without architecture endpoints.                                                                                     |
| `relationship-coverage.json`    | Connected, pending, and excluded catalog entries. The coverage test rejects pending entries.                                                         |

CloudTrail-only evidence establishes an audit connection to CloudTrail, not a direct EventBridge connection. API reference links identify operations; supporting guides establish their scope. Placement and deployment arrows describe configuration rather than network traffic.

The catalog uses the dates recorded in these files. Its lifecycle assessment is dated September 17, 2026; it is not a live availability directory. Check current primary sources before updating a claim. Retain review dates and conditions such as existing-customer access, region restrictions, and service versus feature retirement. Accessible API documentation alone does not establish current availability.

## Regenerate derived files

From `engine/`, run:

```sh
node catalog-sources/document-service-events.mjs
node catalog-sources/document-additional-relationships.mjs
node catalog-sources/document-exclusions.mjs
node catalog-sources/document-coverage.mjs
node catalog-sources/document-relationships.mjs
```

These scripts write catalog modules, coverage records, and the [relationship reference](../docs/relationships.md). Edit the source records before regenerating. Review the resulting data and run `npm test`.

## Import icons

From `engine/`, provide the official AWS architecture icon archive:

```sh
python3 catalog-sources/import-icons.py /path/to/Icon-package.zip
```

The importer writes service and resource icons under `catalog/icons/`, `catalog/services.json`, and `catalog/resource-types-data.js`. Featured service IDs remain stable so saved diagrams retain their service references. See [NOTICE.md](../NOTICE.md) for provenance.

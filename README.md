# Elwing

Create, edit and export architecture diagrams through a local MCP server.
Elwing runs as one user over stdio, needs no AWS account or sign-in, and
stores diagrams and SVG/PNG/Excalidraw exports on your disk. It does not call a model.

## Install

Use Node.js 22 or newer and Git. The prebuilt server is included;
installation needs no compiler. npm installs the native resvg
package for your operating system.

```sh
npm install -g --install-links git+https://github.com/cpyle0819/elwing.git
elwing-mcp --help
```

For a reproducible install, append `#<release-tag>` to the Git URL.

## Connect an MCP client

After installing, add this to your client's MCP configuration:

```json
{
  "mcpServers": {
    "elwing": {
      "command": "elwing-mcp",
      "args": [],
      "env": { "ELWING_DATA_DIR": "/absolute/path/to/diagrams" }
    }
  }
}
```

Omit `env` to use the default folder. Alternatively use
`"command": "npx", "args": ["-y", "github:cpyle0819/elwing"]`.
For Claude Code:

```sh
claude mcp add elwing -- npx -y github:cpyle0819/elwing
```

The client owns the process. Protocol messages use stdout; startup errors use
stderr. No network listener or authentication service is started. After
installation, rendering and storage work offline.

## What you can do

Talk to your agent in plain language; it picks the Elwing tools. Each guide
shows an example request, what Elwing does with it and the image you get back.
Start with the [feature guide](docs/features/README.md).

![Photo uploads architecture diagram](docs/features/diagrams/images/architecture-photo-uploads.png)

| Feature | What it does |
| --- | --- |
| [Architecture diagrams](docs/features/diagrams/architecture-diagrams.md) | Describe a system and get an AWS diagram with service icons, labelled relationships and groups. |
| [Flow charts](docs/features/diagrams/flow-charts.md) | Describe a process and get a top-to-bottom flow chart with decisions and labelled branches. |
| [Edit an existing diagram](docs/features/diagrams/editing-diagrams.md) | Add, rename, connect, regroup or rearrange parts of a saved diagram in one all-or-nothing change. |
| [Badges](docs/features/diagrams/badges.md) | Mark new or changed resources with a coloured corner label. |
| [Readability checks](docs/features/quality/readability-checks.md) | Find overlapping cards, vague or duplicate names and disconnected resources before you share. |
| [Export images and files](docs/features/sharing/exports.md) | Get SVG, PNG or an editable Excalidraw file. |
| [Background colours](docs/features/sharing/backgrounds.md) | Keep the default transparent page or pick a colour for slides and documents. |
| [List, find and delete diagrams](docs/features/management/manage-diagrams.md) | See what you have saved, find diagrams that use a service and delete several at once. |

## Files and recovery

`--data-dir PATH` takes precedence over `ELWING_DATA_DIR`. Defaults:

| System | Folder |
| --- | --- |
| Linux | `$XDG_DATA_HOME/elwing`, or `~/.local/share/elwing` |
| macOS | `~/Library/Application Support/Elwing` |
| Windows | `%LOCALAPPDATA%\Elwing`, or `~/AppData/Local/Elwing` |

Documents live in `diagrams/<id>/diagram.json`; metadata lives beside them
in `meta.json`. Exports live in `exports/<id>/<title>-r<revision>.svg` or `.png`.
The export tool returns an embedded image and its `filePath`. Deleting a
diagram keeps exported files. `receipts/` holds 24-hour retry receipts,
`counter.json` tracks the diagram limit, and `store.json` identifies the
folder format.

Expired retry receipts are removed at startup and at most hourly during use.
Temporary files from interrupted writes are swept at startup; normal tool
calls do not scan export history.

Multiple local clients can use the same folder. A process lock serializes
operations; atomic renames and a transaction journal recover interrupted
writes before serving reads. Use a local filesystem, not a folder synchronized
or shared between machines. Do not edit state files while a server is running.
Back up the whole folder after stopping all servers. If a lock cannot recover,
stop all Elwing processes before removing `.lock`; do not remove
`transaction.json`. Linux is exercised by the release checks; macOS and Windows
paths are supported but native filesystem behavior on those systems has not
yet been verified.

## Tools

Start with `elwing_readability_guide` and `elwing_catalog`. Create a diagram,
apply changes with its current revision and a new mutation ID, arrange and
check readability, then export. Use `elwing_list_diagrams` for inventory and
follow its cursor; it includes revisions and service summaries. Use
`elwing_delete_diagram` with one target or a batch of up to 50.

Identical mutations replay their original result for 24 hours, even after
deletion. On a conflict, read the diagram again and rebuild the change.
Limits are 1,000 diagrams, 200 nodes, 1,000 edges, 2 MB per document and
5 MB per export response.

## Engine and development

`engine/` is the separately installable `elwing-diagram-engine` library.
See its README for named imports and catalog maintenance. `mcp/` contains
the server source, local storage and shared storage contract tests.

```sh
npm ci
npm test
```

Tests install and build the two source packages, run their suites, rebuild
the standalone server and exercise its stdio connection. To rebuild only:

```sh
npm run build
```

Changes are maintained in the source repository and exported here in one
direction. Changes made directly here must be reapplied to that source before
the next export. Release commits identify the source revision.

See `NOTICE.md`, `THIRD-PARTY-LICENSES.md`, `third-party-notices/` and
`dist/fonts/LICENSE`. No licence to the Elwing project source is granted
by this distribution.

# List, find and delete diagrams

Elwing keeps your diagrams between agent sessions. Ask your agent what you have, find diagrams that
use a particular service, or delete ones you no longer need. Diagrams are stored in the server's
[data folder](../../../README.md#files-and-recovery) on your machine.

## See what you have

> List my Elwing diagrams.

The agent gets a summary of each diagram, so it can answer without opening them one by one:

| Title                      | Revision | Resources | Arrows | Services                                       |
| -------------------------- | -------- | --------- | ------ | ---------------------------------------------- |
| Photo uploads              | 2        | 7         | 6      | apigateway, dynamodb, lambda, s3, sqs          |
| Photo uploads with sign-in | 4        | 8         | 7      | apigateway, cognito, dynamodb, lambda, s3, sqs |
| Order approval             | 2        | 7         | 7      | none (flow chart)                              |
| Event intake               | 3        | 4         | 3      | dynamodb, lambda, sqs                          |

Resource counts include groups. Each summary lists up to 20 services; the agent is told when a
diagram has more.

## Find diagrams by service

> Which of my diagrams use Cognito?

The agent filters the same list and answers "Photo uploads with sign-in".

## Delete diagrams

> Delete the "Event intake" diagram and the older "Photo uploads" diagram.

The agent deletes both in one request and reports each result:

```text
Deleted: Photo uploads, Event intake (2 deleted, 0 not found, 0 conflicts)
```

Listing again shows the remaining two diagrams. If you don't name exact diagrams, for example
"delete my old diagrams", the agent confirms the titles with you first.

## Good to know

- **Deletion is immediate and can't be undone.** Exported files are kept. To be able to recover
  diagrams, back up the data folder.
- **Changed since listing?** If a diagram was edited after the agent listed it, that one is skipped
  as a conflict while the others are still deleted. The agent lists again and asks before retrying.
- Up to 50 diagrams can be deleted in one request.
- You can keep up to 1,000 diagrams. Delete unused ones if you reach the limit.
- **Skip delete prompts in Claude Code:** add `mcp__elwing__elwing_delete_diagram` to
  `permissions.allow` in `~/.claude/settings.json`. Replace the first `elwing` if you registered
  the server under a different name (check with `claude mcp list`).

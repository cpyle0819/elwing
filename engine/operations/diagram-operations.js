import {
  validateDocument,
  removeNode,
  updateRelationship,
  addRelationship,
  arrange,
} from '../diagram/model.js';
import { sizeGroups, isGroup, movingNodes } from '../diagram/groups.js';
import { relationshipIssue } from '../catalog/relationship-rules.js';

const fail = (message) => {
  throw Error(message);
};
const find = (items, id, kind) =>
  items.find((item) => item.id === id) ||
  fail(`${kind} ${id} does not exist. Read the current diagram before editing.`);
const semanticNode = (node) => JSON.stringify([node?.service, node?.resourceType]);

// Existing edges survive unrelated edits; changed notation must satisfy current catalog rules.
export function applyOperations(original, operations, serviceIds) {
  const diagram = structuredClone(original);
  const previousNodes = new Map(original.nodes.map((node) => [node.id, node]));
  const previousEdges = new Map(original.edges.map((edge) => [edge.id, edge]));
  for (const operation of operations) {
    const { op, ...args } = operation;
    if (op === 'upsert_node') {
      let node = diagram.nodes.find((node) => node.id === args.id);
      if (!node) {
        if (!args.service) fail('New nodes require an exact service ID from the catalog.');
        node = { id: args.id, service: args.service, name: args.name || args.id, x: 0, y: 0 };
        diagram.nodes.push(node);
      }
      if (isGroup(node) || args.service === 'group')
        fail('Use set_group and move_group for group containers.');
      Object.assign(node, args);
      for (const key of ['groupId', 'resourceType', 'badge'])
        if (node[key] === null) delete node[key];
      // Switching a flowchart shape to another service drops its shape.
      if (node.service !== 'flowchart' && args.shape === undefined) delete node.shape;
    } else if (op === 'remove_node') {
      find(diagram.nodes, args.id, 'Resource');
      removeNode(diagram, args.id);
    } else if (op === 'upsert_edge') {
      const existing = diagram.edges.find((edge) => edge.id === args.id);
      const sides = Object.fromEntries(
        ['sourceSide', 'targetSide']
          .filter((key) => args[key] !== undefined)
          .map((key) => [key, args[key]]),
      );
      if (existing)
        updateRelationship(
          diagram,
          args.id,
          args.source,
          args.verb,
          args.target,
          args.label,
          Object.keys(sides).length ? sides : undefined,
        );
      else
        addRelationship(diagram, args.source, args.verb, args.target, args.id, args.label, sides);
    } else if (op === 'remove_edge') {
      find(diagram.edges, args.id, 'Connection');
      diagram.edges = diagram.edges.filter((edge) => edge.id !== args.id);
    } else if (op === 'set_group') {
      let group = diagram.nodes.find((node) => node.id === args.id);
      if (group && !isGroup(group)) fail('The group ID already belongs to a resource.');
      for (const id of args.members)
        if (isGroup(find(diagram.nodes, id, 'Group member')))
          fail('Nested groups are unsupported.');
      if (!group) {
        group = { id: args.id, service: 'group', name: args.name, x: 0, y: 0 };
        diagram.nodes.push(group);
      }
      group.name = args.name;
      for (const node of diagram.nodes) {
        if (node.groupId === args.id) delete node.groupId;
        if (args.members.includes(node.id)) node.groupId = args.id;
      }
      sizeGroups(diagram);
    } else if (op === 'move_group') {
      sizeGroups(diagram);
      const group = find(diagram.nodes, args.id, 'Group');
      if (!isGroup(group)) fail('move_group requires a group ID.');
      const dx = args.x - group.x,
        dy = args.y - group.y;
      for (const node of movingNodes(diagram, [args.id])) {
        node.x += dx;
        node.y += dy;
      }
    } else if (op === 'rename_diagram') diagram.title = args.title;
    else if (op === 'arrange') arrange(diagram, args);
    else fail(`Unknown diagram operation: ${op}`);
  }
  sizeGroups(diagram);
  validateDocument(diagram, serviceIds);
  const nodes = new Map(diagram.nodes.map((node) => [node.id, node]));
  for (const edge of diagram.edges) {
    const old = previousEdges.get(edge.id);
    if (
      JSON.stringify(old) !== JSON.stringify(edge) ||
      semanticNode(nodes.get(edge.source)) !== semanticNode(previousNodes.get(edge.source)) ||
      semanticNode(nodes.get(edge.target)) !== semanticNode(previousNodes.get(edge.target))
    ) {
      const issue = relationshipIssue(nodes.get(edge.source), edge.verb, nodes.get(edge.target));
      if (issue) fail(issue);
    }
  }
  return diagram;
}

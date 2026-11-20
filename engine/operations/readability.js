import { isGroup, nodeWidth, nodeHeight } from '../diagram/groups.js';
import { badgeLayout, BADGE_MARGIN } from '../diagram/badge.js';
import { isFlowchart } from '../diagram/flowchart.js';

export { readabilityGuide } from '../guidance/readability-guide.js';

// These findings identify review candidates; intended exceptions remain the agent's and user's decision.
export function checkReadability(diagram) {
  const resources = diagram.nodes.filter((node) => !isGroup(node));
  const findings = [];
  const add = (code, ids, message) => findings.push({ code, ids, message });
  for (let i = 0; i < resources.length; i++) {
    const a = resources[i];
    for (const b of resources.slice(i + 1)) {
      if (
        a.x < b.x + nodeWidth(b) &&
        a.x + nodeWidth(a) > b.x &&
        a.y < b.y + nodeHeight(b) &&
        a.y + nodeHeight(a) > b.y
      )
        add(
          'overlapping_resources',
          [a.id, b.id],
          'Separate these resource cards so both names and connection endpoints are readable.',
        );
    }
  }
  // A badge overhangs its card's corner, so a close neighbour can collide with it.
  for (const a of resources) {
    const badge = badgeLayout(a, nodeWidth(a));
    if (!badge) continue;
    const left = a.x + badge.x - BADGE_MARGIN,
      top = a.y + badge.y - BADGE_MARGIN,
      right = a.x + badge.x + badge.width + BADGE_MARGIN,
      bottom = a.y + badge.y + badge.height + BADGE_MARGIN;
    for (const b of resources)
      if (
        b !== a &&
        left < b.x + nodeWidth(b) &&
        right > b.x &&
        top < b.y + nodeHeight(b) &&
        bottom > b.y
      )
        add(
          'crowded_badge',
          [a.id, b.id],
          `Move ${b.id} further from ${a.id} so ${a.id}'s badge stays fully visible.`,
        );
  }
  const degree = new Map(diagram.nodes.map((node) => [node.id, 0]));
  for (const edge of diagram.edges) {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
    const label = edge.label || edge.verb;
    if (label.trim().split(/\s+/).length > 3)
      add(
        'long_connection_label',
        [edge.id],
        'Consider a shorter operation label and move explanatory detail into resource descriptions.',
      );
    if (/^(uses|connects to|relates to)$/i.test(label.trim()))
      add(
        'vague_operation',
        [edge.id],
        'Use the actual operation when it is known; check its documented direction.',
      );
  }
  const names = new Map();
  for (const node of diagram.nodes) {
    const name = (node.resourceName || node.name).trim();
    if (!name || /^(new group|custom|untitled|resource)( \d+)?$/i.test(name))
      add(
        'unclear_role',
        [node.id],
        'Name the resource or group by the role it plays in this diagram.',
      );
    // Flow charts repeat step names such as "End" by design.
    const key = name.toLowerCase();
    if (!isFlowchart(node) && names.has(key))
      add(
        'duplicate_name',
        [names.get(key), node.id],
        'Distinguish these resources by role or scope if the shared name is ambiguous.',
      );
    else if (!isFlowchart(node)) names.set(key, node.id);
    if ((degree.get(node.id) || 0) > 6)
      add(
        'dense_connections',
        [node.id],
        'Review this hub for overlapping explanations; a separate overview or detail diagram may clarify it.',
      );
    if (!isGroup(node) && !degree.get(node.id) && resources.length > 1)
      add(
        'isolated_resource',
        [node.id],
        'Explain this resource’s role or connect it only when a real interaction exists.',
      );
    if (isGroup(node) && !diagram.nodes.some((member) => member.groupId === node.id))
      add('empty_group', [node.id], 'Confirm this boundary has a purpose in the current view.');
  }
  // Flow chart structure: decisions branch with labelled arrows; start/end shapes only begin or end.
  for (const node of resources.filter(isFlowchart)) {
    const outgoing = diagram.edges.filter((edge) => edge.source === node.id);
    const incoming = diagram.edges.filter((edge) => edge.target === node.id);
    if (node.shape === 'decision') {
      if (outgoing.length < 2)
        add(
          'decision_without_branches',
          [node.id],
          'Give this decision at least two outgoing flow arrows, such as Yes and No, or make it a process step.',
        );
      for (const edge of outgoing)
        if (!edge.label?.trim())
          add(
            'unlabelled_decision_branch',
            [edge.id],
            'Label each arrow leaving a decision with its answer, such as Yes or No.',
          );
    }
    if (node.shape === 'start-end' && incoming.length && outgoing.length)
      add(
        'start_end_in_middle',
        [node.id],
        'A start/end shape should only begin the flow (outgoing arrows) or end it (incoming arrows); use a process step in the middle.',
      );
  }
  return {
    heuristic: true,
    resourceCount: resources.length,
    connectionCount: diagram.edges.length,
    findingCount: findings.length,
    findings: findings.slice(0, 50),
    truncated: findings.length > 50,
  };
}

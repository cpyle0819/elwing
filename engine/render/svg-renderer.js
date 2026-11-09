import { assignConnectorColors } from '../diagram/connector-colors.js';
import { serviceIconUrl } from './service-icons.js';
import { isGroup, sizeGroups, nodeWidth, nodeHeight } from '../diagram/groups.js';
import {
  connectorEdges,
  connectorCrossings,
  crossingDashes,
} from '../diagram/diagram-presentation.js';
import { routeGraph, routingBounds } from '../diagram/routing.js';
import { nodeIconId } from '../catalog/resource-types.js';
import { escapeMarkup as escape } from '../diagram/text.js';
import { wrapResourceText, resourceTextTop } from '../diagram/resource-sizing.js';

const edgeLabel = (edge) => edge.label ?? edge.verb;
const truncate = (text, limit) => (text.length > limit ? text.slice(0, limit - 1) + '…' : text);

function wrappedLabel(node) {
  const lines = wrapResourceText(node.name, nodeWidth(node));
  const top = resourceTextTop(node);
  const maxLines = Math.max(1, Math.floor((nodeHeight(node) - top - 15) / 16) + 1);
  return lines
    .slice(0, maxLines)
    .map((line, index) => {
      const label =
        index === maxLines - 1 && lines.length > maxLines ? line.slice(0, -1) + '…' : line;
      return `<tspan x="14" y="${top + index * 16}">${escape(label)}</tspan>`;
    })
    .join('');
}

function editableField(key, label, enabled) {
  return enabled
    ? `data-custom-field="${key}" tabindex="0" role="button" aria-label="Edit ${label}"`
    : '';
}

function nodeFrame(node, body, selected, exporting) {
  return `<g class="node${node.preview ? ' resource-preview-node' : ''}"
    data-node="${escape(node.id)}" transform="translate(${node.x},${node.y})"
    tabindex="0" role="button" aria-label="Select ${escape(node.name)}" aria-pressed="${selected}">
    <rect width="${nodeWidth(node)}" height="${nodeHeight(node)}" rx="5" fill="#fffefa"
      stroke="${selected ? '#276c89' : '#bcc9cf'}" stroke-width="${selected ? 2 : 1}"/>
    ${body}
    ${
      exporting || node.preview
        ? ''
        : `<g class="resource-resize-handle" data-resize-resource="${escape(node.id)}"
      transform="translate(${nodeWidth(node) - 24},${nodeHeight(node) - 24})" tabindex="0" role="button"
      aria-label="Resize resource card" aria-description="Drag to resize. Arrow keys resize by 10; Shift by 40. Home resets automatic sizing.">
      <rect width="24" height="24" fill="transparent" stroke="none"/>
      <path d="M8 19 19 8M14 19 19 14" fill="none" stroke="#688a97" stroke-width="2"/>
    </g>`
    }
  </g>`;
}

function customNodeBody(node, exporting) {
  const heading = node.resourceName || 'Custom';
  const editable = !exporting && !node.preview;
  const labelLines = wrappedLabel(node);
  const icon = node.icon
    ? `<image href="${escape(node.icon)}" x="12" y="12" width="28" height="28"/>`
    : '';
  return `${icon}
    <text class="custom-node-text" ${editableField('resourceName', 'resource heading', editable)}
      x="${node.icon ? 48 : 14}" y="28" fill="#506a78" font-size="12" font-weight="600"><title>${escape(heading)}</title>${escape(truncate(heading, Math.floor((nodeWidth(node) - (node.icon ? 62 : 28)) / 7)))}</text>
    <text class="custom-node-text" ${editableField('name', 'resource label', editable)}
      fill="#243744" font-size="12"><title>${escape(node.name)}</title>${labelLines}</text>`;
}

function serviceNodeBody(node, { exporting, iconData, serviceLabel }) {
  const label = serviceLabel(node);
  const icon = exporting ? iconData[nodeIconId(node)] : serviceIconUrl(nodeIconId(node));
  const labelLines = wrappedLabel(node);
  return `<image href="${icon}" x="14" y="13" width="33" height="33"/>
    <text x="57" y="34" fill="#506a78" font-size="${node.resourceType ? 10 : 11}"><title>${escape(label)}</title>${escape(truncate(label, Math.floor((nodeWidth(node) - 70) / (node.resourceType ? 5.2 : 6.5))))}</text>
    <text fill="#243744" font-size="12" font-weight="600"><title>${escape(node.name)}</title>${labelLines}</text>`;
}

function groupMarkup(group, { exporting, selection, memberCounts }) {
  const selected = !exporting && selection.has(group.id);
  const emphasized = !exporting && (group.dropTarget || selected);
  const width = nodeWidth(group);
  const editing = exporting ? '' : 'tabindex="0" role="button" aria-label="Edit group label"';
  const count = memberCounts.get(group.id) || 0;
  const showCount = count > 0 && width >= Math.max(340, group.name.length * 8 + 110);
  const emptyHint = count
    ? ''
    : '<text x="16" y="80" font-size="12" fill="#637c86">Drop resources here</text>';
  return `<g class="diagram-group" data-node="${escape(group.id)}" tabindex="0" role="button"
    aria-label="Select group ${escape(group.name)}" aria-pressed="${selected}"
    transform="translate(${group.x},${group.y})">
    <rect width="${width}" height="${nodeHeight(group)}" rx="10" fill="#e9dfcb"
      stroke="${emphasized ? '#956022' : '#a17b43'}" stroke-width="${emphasized ? 2 : 1.2}"/>
    <path d="M 1 39 H ${width - 1}" stroke="#cbb793"/>
    ${showCount ? `<text x="${width - 16}" y="25" text-anchor="end" font-size="10" fill="#766247">${count} resources</text>` : ''}
    <text data-custom-field="name" ${editing} x="16" y="25" font-size="13"
      font-weight="600" fill="#355b6b"><title>${escape(group.name)}</title>${escape(truncate(group.name, Math.floor((width - (showCount ? 110 : 32)) / 8)))}</text>
    ${emptyHint}
  </g>`;
}

function connectorLabel(edge, route, exporting, color) {
  if (!route.labelText) return '';
  const label = edgeLabel(edge);
  const action = edge.combined
    ? 'Edit read and write relationships'
    : `Edit connection label: ${label}`;
  const editing =
    !exporting && !edge.preview
      ? `${edge.combined ? 'data-combined-edge' : 'data-edit-label'}="${escape(edge.id)}"
       tabindex="0" role="button" aria-label="${escape(action)}"`
      : '';
  return `<g class="connector-label" ${editing}
    transform="translate(${route.x},${route.y}) rotate(${route.labelAngle})">
    <title>${escape(label)}</title>
    <text x="0" y="4" text-anchor="middle" ${color && !exporting ? `style="fill:var(--connector-color,${color.light})"` : ''} fill="${color?.light || '#506a78'}" font-size="11"
      paint-order="stroke" stroke="#f7f5ef" stroke-width="3" stroke-linejoin="round">${escape(route.labelText)}</text>
  </g>`;
}

function edgeMarkup(edge, route, { exporting, markerId, colors }, gaps) {
  const color = colors?.get(edge.id);
  const arrowId = color ? `${markerId}-color-${color.index}` : markerId;
  const dashes = edge.preview ? '' : crossingDashes(route, gaps);
  const hitArea = exporting
    ? ''
    : `<path class="edge-hit" d="${route.d}" fill="none"
    stroke="transparent" stroke-width="14" pointer-events="stroke"/>`;
  return `<g ${color ? `data-connector-color="${color.index}" style="--connector-light:${color.light};--connector-dark:${color.dark}"` : ''} data-relationship-edge="${escape(edge.id)}" data-edge-ids="${escape(JSON.stringify(edge.edgeIds))}"
    ${edge.preview ? 'class="resource-preview-edge"' : ''}
    ${!exporting && !edge.preview ? `tabindex="0" role="button" aria-label="Select resources connected by ${escape(edgeLabel(edge))}"` : ''}>
    <title>${escape(edgeLabel(edge))}</title>
    ${hitArea}
    <path class="edge-line"${color && !exporting ? ` style="stroke:var(--connector-color,${color.light})"` : ''}${dashes ? ` stroke-dasharray="${dashes}"` : ''} d="${route.d}" fill="none" stroke="${color?.light || '#718894'}" stroke-width="1.7"
      stroke-linejoin="round" marker-end="url(#${arrowId})"/>
    ${connectorLabel(edge, route, exporting, color)}
  </g>`;
}

function arrowMarker(markerId, color, exporting = false) {
  return `<defs><marker ${color ? `data-connector-color="${color.index}" style="--connector-light:${color.light};--connector-dark:${color.dark}"` : ''} id="${markerId}" viewBox="0 0 10 10" refX="9" refY="5"
    markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M 0 0 L 10 5 L 0 10 z" ${color && !exporting ? `style="fill:var(--connector-color,${color.light})"` : ''} fill="${color?.light || '#718894'}"/>
  </marker></defs>`;
}

// Callers supply selection and icon data; all geometry is computed synchronously.
export function createDiagramRenderer({ serviceLabel }) {
  const routingCache = new WeakMap();
  let latestRoutes;
  let colorCache = {};
  function resolveRoutes(graph) {
    sizeGroups(graph);
    const key = JSON.stringify([
      graph.nodes.map((node) => [
        node.id,
        node.service,
        node.x,
        node.y,
        nodeWidth(node),
        nodeHeight(node),
        node.groupId,
      ]),
      graph.edges,
    ]);
    const cached = routingCache.get(graph);
    if (cached?.key === key) return cached;
    if (latestRoutes?.key === key) {
      routingCache.set(graph, latestRoutes);
      return latestRoutes;
    }
    const geometry = {
      nodes: graph.nodes.map((node) => ({
        id: node.id,
        service: node.service,
        x: node.x,
        y: node.y,
        width: nodeWidth(node),
        height: nodeHeight(node),
        groupId: node.groupId,
      })),
      edges: connectorEdges(graph.edges),
    };
    const routes = routeGraph(geometry);
    latestRoutes = { key, graph: geometry, routes };
    routingCache.set(graph, latestRoutes);
    return latestRoutes;
  }

  function bounds(graph) {
    return routingBounds(graph, resolveRoutes(graph).routes);
  }

  function render(
    graph,
    {
      exporting = false,
      selection = [],
      markerId = 'arrow',
      iconData = {},
      colorConnectors = false,
    } = {},
  ) {
    sizeGroups(graph);
    const routes = resolveRoutes(graph).routes;
    const memberCounts = new Map();
    for (const node of graph.nodes)
      if (node.groupId) memberCounts.set(node.groupId, (memberCounts.get(node.groupId) || 0) + 1);
    const visibleEdges = connectorEdges(graph.edges);
    const colorKey = colorConnectors
      ? JSON.stringify(visibleEdges.map(({ id, source, target }) => [id, source, target]))
      : null;
    if (colorConnectors && colorCache.key !== colorKey)
      colorCache = { key: colorKey, colors: assignConnectorColors(visibleEdges) };
    const colors = new Map(colorConnectors ? colorCache.colors : []);
    for (const edge of visibleEdges)
      if (/^#[0-9a-f]{6}$/i.test(edge.color || ''))
        colors.set(edge.id, {
          index: `override-${edge.color.slice(1)}`,
          light: edge.color,
          dark: edge.color,
        });
    const options = {
      colors,
      exporting,
      selection: new Set(selection),
      markerId,
      iconData,
      serviceLabel,
      memberCounts,
    };
    const groups = graph.nodes
      .filter(isGroup)
      .map((node) => groupMarkup(node, options))
      .join('');
    const crossings = connectorCrossings(routes);
    const edges = visibleEdges
      .map((edge) => edgeMarkup(edge, routes.get(edge.id), options, crossings.get(edge.id)))
      .join('');
    const nodes = graph.nodes
      .filter((node) => !isGroup(node))
      .map((node) => {
        const body =
          node.service === 'custom'
            ? customNodeBody(node, exporting)
            : serviceNodeBody(node, options);
        return nodeFrame(node, body, !exporting && options.selection.has(node.id), exporting);
      })
      .join('');
    // SVG paint order keeps opaque groups behind connectors and resource cards.
    const markers =
      arrowMarker(markerId) +
      [...new Map([...colors.values()].map((color) => [color.index, color])).values()]
        .map((color) => arrowMarker(`${markerId}-color-${color.index}`, color, exporting))
        .join('');
    return `${markers}<g font-family="Arial, sans-serif">${groups}${edges}${nodes}</g>`;
  }

  return { render, bounds, routes: (graph) => structuredClone(resolveRoutes(graph).routes) };
}

import { normalizeBackground } from './image-export.js';
import { isGroup, nodeWidth, nodeHeight } from './groups.js';
import { connectorEdges } from './diagram-presentation.js';
import { wrapResourceText, resourceTextTop } from './resource-sizing.js';
import { nodeIconId } from '../catalog/resource-types.js';
import { badgeLayout, BADGE_FONT_SIZE } from './badge.js';
import { isFlowchart, flowPolygon, flowFill, FLOW_STROKE, FLOW_TEXT, WAVE } from './flowchart.js';
import { flowTextLines } from './resource-sizing.js';

// Stadium outline sampled as a polygon; Excalidraw caps rectangle corner radius.
function stadiumPoints(w, h) {
  const r = Math.min(w, h) / 2,
    points = [];
  for (let i = 0; i <= 32; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / 32;
    points.push([w - r + r * Math.cos(a), r + r * Math.sin(a)]);
  }
  for (let i = 0; i <= 32; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / 32;
    points.push([r + r * Math.cos(a), r + r * Math.sin(a)]);
  }
  return points;
}

const truncate = (text, limit) => (text.length > limit ? text.slice(0, limit - 1) + '…' : text);
const digits = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const seed = (id) => {
  let value = 2166136261;
  for (const character of id) value = Math.imul(value ^ character.codePointAt(0), 16777619);
  return value >>> 1;
};
// Valid, increasing fractional-index integer keys; enough for the service's element limit.
const indexKey = (index) =>
  'c' + [3844, 62, 1].map((place) => digits[Math.floor(index / place) % 62]).join('');

// Pure scene serialization: keep layout/routing in the existing renderer.
export function diagramExcalidraw(
  graph,
  renderer,
  { iconData = {}, serviceLabel = (node) => node.service, updatedAt, background } = {},
) {
  const fill = normalizeBackground(background);
  const copy = structuredClone(graph);
  const bounds = renderer.bounds(copy);
  const routes = renderer.routes(copy);
  const width = bounds.maxX - bounds.minX + 80;
  const height = bounds.maxY - bounds.minY + 100;
  const timestamp = new Date(updatedAt ?? '').getTime();
  const updated = Number.isFinite(timestamp) ? timestamp : 0;
  const elements = [];
  const files = {};
  const fileIds = new Map();
  const cards = new Map();
  const cardId = (id) => `card:${JSON.stringify(id)}`;
  function element(type, id, x, y, width, height, extra = {}) {
    const value = {
      id,
      type,
      x,
      y,
      width,
      height,
      angle: 0,
      strokeColor: '#bcc9cf',
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: 1,
      strokeStyle: 'solid',
      roughness: 0,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: null,
      seed: seed(id),
      version: 1,
      versionNonce: seed(id),
      isDeleted: false,
      boundElements: [],
      updated,
      link: null,
      locked: false,
      ...extra,
    };
    elements.push(value);
    return value;
  }
  function text(id, value, x, baseline, fontSize, width, extra = {}) {
    if (!value) return;
    return element(
      'text',
      id,
      x,
      baseline - fontSize,
      width,
      value.split('\n').length * (fontSize === 12 ? 16 : fontSize * 1.25),
      {
        strokeColor: '#243744',
        fontSize,
        fontFamily: 2,
        text: value,
        originalText: value,
        textAlign: 'left',
        verticalAlign: 'top',
        containerId: null,
        autoResize: false,
        lineHeight: fontSize === 12 ? 16 / 12 : 1.25,
        ...extra,
      },
    );
  }
  function image(id, source, x, y, size, groupIds) {
    if (!source) return;
    let fileId = fileIds.get(source);
    if (!fileId) {
      fileId = `icon-${fileIds.size}`;
      fileIds.set(source, fileId);
      files[fileId] = {
        id: fileId,
        mimeType: source.slice(5, source.indexOf(';')),
        dataURL: source,
        created: updated,
        lastRetrieved: updated,
      };
    }
    element('image', id, x, y, size, size, {
      fileId,
      status: 'saved',
      scale: [1, 1],
      crop: null,
      groupIds,
    });
  }
  function line(type, id, points, extra = {}) {
    const [first] = points;
    const xs = points.map((point) => point.x),
      ys = points.map((point) => point.y);
    return element(
      type,
      id,
      first.x,
      first.y,
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
      {
        points: points.map((point) => [point.x - first.x, point.y - first.y]),
        lastCommittedPoint: null,
        startBinding: null,
        endBinding: null,
        startArrowhead: null,
        endArrowhead: null,
        ...extra,
      },
    );
  }
  text(
    'title',
    copy.title,
    bounds.minX - 10,
    bounds.minY - 30,
    18,
    Math.max(width - 60, copy.title.length * 11),
  );
  for (const node of copy.nodes.filter(isGroup)) {
    const id = cardId(node.id),
      groupIds = [`unit:${JSON.stringify(node.id)}`];
    const w = nodeWidth(node),
      h = nodeHeight(node);
    const count = copy.nodes.filter((member) => member.groupId === node.id).length;
    const showCount = count > 0 && w >= Math.max(340, node.name.length * 8 + 110);
    cards.set(
      node.id,
      element('rectangle', id, node.x, node.y, w, h, {
        backgroundColor: '#e9dfcb',
        strokeColor: '#a17b43',
        strokeWidth: 1.2,
        roundness: { type: 3, value: 10 },
        groupIds,
      }),
    );
    line(
      'line',
      `${id}:divider`,
      [
        { x: node.x + 1, y: node.y + 39 },
        { x: node.x + w - 1, y: node.y + 39 },
      ],
      { strokeColor: '#cbb793', groupIds },
    );
    text(
      `${id}:name`,
      truncate(node.name, Math.floor((w - (showCount ? 110 : 32)) / 8)),
      node.x + 16,
      node.y + 25,
      13,
      w - (showCount ? 110 : 32),
      { strokeColor: '#355b6b', groupIds },
    );
    if (showCount)
      text(`${id}:count`, `${count} resources`, node.x + w - 106, node.y + 25, 10, 90, {
        textAlign: 'right',
        strokeColor: '#766247',
        groupIds,
      });
    if (!count)
      text(`${id}:hint`, 'Drop resources here', node.x + 16, node.y + 80, 12, w - 32, {
        strokeColor: '#637c86',
        groupIds,
      });
  }
  // Native diamond or rectangle where Excalidraw has one; otherwise a filled
  // closed line drawn behind a transparent rectangle that holds the text and arrow bindings.
  function flowchartElements(node, id, groupIds, w, h) {
    const fill = flowFill(node.shape);
    const style = { strokeColor: FLOW_STROKE, strokeWidth: 1.5, backgroundColor: fill, groupIds };
    const native = {
      decision: 'diamond',
      process: 'rectangle',
      subprocess: 'rectangle',
    }[node.shape];
    let container;
    if (native) container = element(native, id, node.x, node.y, w, h, style);
    else {
      const points =
        node.shape === 'start-end' ? stadiumPoints(w, h) : flowPolygon(node.shape, w, h);
      line(
        'line',
        `${id}:outline`,
        [...points, points[0]].map(([x, y]) => ({ x: node.x + x, y: node.y + y })),
        style,
      );
      container = element('rectangle', id, node.x, node.y, w, h, {
        strokeColor: 'transparent',
        backgroundColor: 'transparent',
        groupIds,
      });
    }
    cards.set(node.id, container);
    if (node.shape === 'subprocess')
      for (const x of [12, w - 12])
        line(
          'line',
          `${id}:bar:${x}`,
          [
            { x: node.x + x, y: node.y },
            { x: node.x + x, y: node.y + h },
          ],
          style,
        );
    const lines = flowTextLines(node, w, h);
    const fontSize = 12;
    const textHeight = lines.length * 16;
    const centre = node.shape === 'document' ? (h - WAVE) / 2 : h / 2;
    const label = text(
      `${id}:name`,
      lines.join('\n'),
      node.x,
      node.y + centre - textHeight / 2 + fontSize,
      fontSize,
      w,
      {
        strokeColor: FLOW_TEXT,
        textAlign: 'center',
        verticalAlign: 'middle',
        containerId: container.id,
        groupIds,
      },
    );
    if (label) container.boundElements.push({ id: label.id, type: 'text' });
  }
  // Draw connectors behind opaque resource cards, just as SVG does.
  const arrowElements = [];
  for (const edge of connectorEdges(copy.edges)) {
    const route = routes.get(edge.id);
    const id = `edge:${JSON.stringify(edge.id)}`;
    const arrow = line('arrow', id, route.points, {
      strokeColor: /^#[0-9a-f]{6}$/i.test(edge.color || '') ? edge.color : '#718894',
      strokeWidth: 1.7,
      endArrowhead: 'triangle',
      elbowed: false,
    });
    arrowElements.push({ edge, route, arrow });
    if (route.labelText) {
      const points = route.points,
        middle = Math.floor((points.length - 1) / 2);
      const a = points[middle],
        b = points[middle + (points.length % 2 === 0 ? 1 : 0)];
      const labelWidth = Math.max(1, route.labelText.length * 6.5);
      const label = text(
        `${id}:label`,
        route.labelText,
        (a.x + b.x) / 2 - labelWidth / 2,
        (a.y + b.y) / 2 + 11 - (11 * 1.25) / 2,
        11,
        labelWidth,
        {
          containerId: id,
          textAlign: 'center',
          verticalAlign: 'middle',
          strokeColor: arrow.strokeColor,
        },
      );
      arrow.boundElements.push({ id: label.id, type: 'text' });
    }
  }
  for (const node of copy.nodes.filter((node) => !isGroup(node))) {
    const id = cardId(node.id),
      groupIds = [`unit:${JSON.stringify(node.id)}`];
    const w = nodeWidth(node),
      h = nodeHeight(node);
    if (isFlowchart(node)) {
      flowchartElements(node, id, groupIds, w, h);
      continue;
    }
    cards.set(
      node.id,
      element('rectangle', id, node.x, node.y, w, h, {
        backgroundColor: '#fffefa',
        roundness: { type: 3, value: 5 },
        groupIds,
      }),
    );
    const custom = node.service === 'custom';
    const source = custom ? node.icon : iconData[nodeIconId(node)];
    image(
      `${id}:icon`,
      source,
      node.x + (custom ? 12 : 14),
      node.y + (custom ? 12 : 13),
      custom ? 28 : 33,
      groupIds,
    );
    const heading = custom ? node.resourceName || 'Custom' : serviceLabel(node);
    const offset = custom ? (node.icon ? 48 : 14) : 57;
    const available = custom ? w - (node.icon ? 62 : 28) : w - 70;
    const size = custom ? 12 : node.resourceType ? 10 : 11;
    text(
      `${id}:heading`,
      truncate(heading, Math.floor(available / (custom ? 7 : node.resourceType ? 5.2 : 6.5))),
      node.x + offset,
      node.y + (custom ? 28 : 34),
      size,
      available,
      { strokeColor: '#506a78', groupIds },
    );
    const top = resourceTextTop(node),
      lines = wrapResourceText(node.name, w);
    const maxLines = Math.max(1, Math.floor((h - top - 15) / 16) + 1);
    const value = lines
      .slice(0, maxLines)
      .map((line, index) =>
        index === maxLines - 1 && lines.length > maxLines ? line.slice(0, -1) + '…' : line,
      )
      .join('\n');
    text(`${id}:name`, value, node.x + 14, node.y + top, 12, w - 28, { groupIds });
  }
  // Badges come after every card so a neighbouring card never hides one.
  for (const node of copy.nodes.filter((node) => !isGroup(node))) {
    const id = cardId(node.id),
      groupIds = [`unit:${JSON.stringify(node.id)}`];
    const badge = badgeLayout(node, nodeWidth(node));
    if (badge) {
      const pill = element(
        'rectangle',
        `${id}:badge`,
        node.x + badge.x,
        node.y + badge.y,
        badge.width,
        badge.height,
        {
          strokeColor: badge.color,
          backgroundColor: badge.color,
          roundness: { type: 3, value: badge.height / 2 },
          groupIds,
        },
      );
      const label = element(
        'text',
        `${id}:badge:label`,
        node.x + badge.x,
        node.y + badge.y + (badge.height - BADGE_FONT_SIZE * 1.25) / 2,
        badge.width,
        BADGE_FONT_SIZE * 1.25,
        {
          strokeColor: badge.textColor,
          fontSize: BADGE_FONT_SIZE,
          fontFamily: 2,
          text: badge.label,
          originalText: badge.label,
          textAlign: 'center',
          verticalAlign: 'middle',
          containerId: pill.id,
          autoResize: false,
          lineHeight: 1.25,
          groupIds,
        },
      );
      pill.boundElements.push({ id: label.id, type: 'text' });
    }
  }
  for (const { edge, route, arrow } of arrowElements) {
    for (const [end, nodeId, point] of [
      ['start', edge.source, route.points[0]],
      ['end', edge.target, route.points.at(-1)],
    ]) {
      const card = cards.get(nodeId);
      const dx = point.x - (card.x + card.width / 2);
      const dy = point.y - (card.y + card.height / 2);
      // Normalized location along the selected side, used when Excalidraw moves a card.
      const side = route[`${end === 'start' ? 'source' : 'target'}Side`];
      const focus =
        side === 'left'
          ? -dy / (card.height / 2)
          : side === 'right'
            ? dy / (card.height / 2)
            : side === 'top'
              ? dx / (card.width / 2)
              : -dx / (card.width / 2);
      // Excalidraw treats zero gap as an interior binding when a card moves.
      const gap = Math.max(1, Math.abs(dx) - card.width / 2, Math.abs(dy) - card.height / 2);
      arrow[`${end}Binding`] = { elementId: card.id, focus: Math.max(-1, Math.min(1, focus)), gap };
      card.boundElements.push({ id: arrow.id, type: 'arrow' });
    }
  }
  elements.forEach((value, index) => {
    value.index = indexKey(index);
  });
  return {
    text: JSON.stringify({
      type: 'excalidraw',
      version: 2,
      source: 'Elwing',
      elements,
      appState: { viewBackgroundColor: fill, exportBackground: fill !== 'transparent' },
      files,
    }),
    width,
    height,
  };
}

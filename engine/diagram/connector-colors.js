// Color is an optional tracing aid; labels, arrowheads, and selection retain their meaning.
export const connectorBackgrounds = {
  light: ['#f7f5ef', '#e9dfcb'],
  dark: ['#102936', '#153a49', '#192f3b', '#163542'],
};

function luminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map((part) => {
    const value = parseInt(part, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
export function contrastRatio(a, b) {
  const first = luminance(a),
    second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
function hsl(hue, saturation, lightness) {
  const amplitude = saturation * Math.min(lightness, 1 - lightness);
  const channel = (offset) => {
    const k = (offset + hue / 30) % 12;
    return Math.round(255 * (lightness - amplitude * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

const palette = [];
let candidate = 0;
function paletteColor(index) {
  while (palette.length <= index) {
    const hue = (205 + candidate * 137.508) % 360;
    const saturation = 0.58 + ((candidate * 0.413) % 1) * 0.22;
    candidate++;
    const color = {};
    for (const [theme, backgrounds] of Object.entries(connectorBackgrounds)) {
      let lightness = theme === 'light' ? 0.42 : 0.65;
      while (true) {
        color[theme] = hsl(hue, saturation, lightness);
        if (backgrounds.every((background) => contrastRatio(color[theme], background) >= 4.5))
          break;
        lightness += theme === 'light' ? -0.01 : 0.01;
      }
    }
    // Expand instead of cycling a fixed palette, including on high-degree resources.
    if (palette.some((existing) => existing.light === color.light || existing.dark === color.dark))
      continue;
    palette.push(color);
  }
  return palette[index];
}

// Edges sharing either endpoint cannot share a color, including reverse and parallel connections.
export function assignConnectorColors(edges) {
  const occupied = new Map(),
    assignments = new Map();
  for (const edge of [...edges].sort((a, b) => a.id.localeCompare(b.id))) {
    const source = occupied.get(edge.source) || new Set();
    const target = occupied.get(edge.target) || new Set();
    let index = 0;
    while (source.has(index) || target.has(index)) index++;
    source.add(index);
    target.add(index);
    occupied.set(edge.source, source);
    occupied.set(edge.target, target);
    assignments.set(edge.id, { index, ...paletteColor(index) });
  }
  return assignments;
}

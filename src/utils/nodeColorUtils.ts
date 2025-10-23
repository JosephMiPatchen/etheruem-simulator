/**
 * Utility functions for determining node paint colors
 */

export const PAINT_COLORS = ['blue', 'green', 'red', 'yellow'] as const;
export type PaintColorName = typeof PAINT_COLORS[number];

/**
 * Color emojis for visual display
 */
export const COLOR_EMOJIS: Record<PaintColorName, string> = {
  blue: '🔵',
  green: '🟢',
  red: '🔴',
  yellow: '🟡'
};

/**
 * CSS color values for styling
 */
export const COLOR_CSS: Record<PaintColorName, string> = {
  blue: '#3b82f6',
  green: '#22c55e',
  red: '#ef4444',
  yellow: '#eab308'
};

/**
 * Static map of node IDs to paint colors
 */
const NODE_COLOR_MAP: Record<string, PaintColorName> = {
  'Alpha': 'blue',
  'Bravo': 'green',
  'Charlie': 'red',
  'Delta': 'yellow',
  'Echo': 'blue',
  'Foxtrot': 'green',
  'Golf': 'red',
  'Hotel': 'yellow'
};

/**
 * Get the deterministic paint color for a node based on its ID
 */
export function getNodePaintColor(nodeId: string): PaintColorName {
  // Use static map if available, otherwise default to blue
  return NODE_COLOR_MAP[nodeId] || 'blue';
}

/**
 * Get the color emoji for a node
 */
export function getNodeColorEmoji(nodeId: string): string {
  const color = getNodePaintColor(nodeId);
  return COLOR_EMOJIS[color];
}

/**
 * Get the CSS color value for a node
 */
export function getNodeColorCSS(nodeId: string): string {
  const color = getNodePaintColor(nodeId);
  return COLOR_CSS[color];
}

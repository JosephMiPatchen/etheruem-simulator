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
  'Blue': 'blue',
  'Green': 'green',
  'Red': 'red',
  'Yellow': 'yellow'
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

/**
 * Get a subtle background tint color for a node panel
 * Returns a light gray background with a subtle color tint
 */
export function getNodeBackgroundTint(nodeId: string): string {
  const color = getNodePaintColor(nodeId);
  
  // Light gray backgrounds with subtle color tints
  // Using rgb values that mix gray (45, 52, 54) with a hint of the node color
  const BACKGROUND_TINTS: Record<PaintColorName, string> = {
    blue: 'rgb(43, 50, 56)',      // Gray with subtle blue tint
    green: 'rgb(43, 52, 52)',     // Gray with subtle green tint
    red: 'rgb(48, 50, 52)',       // Gray with subtle red tint
    yellow: 'rgb(48, 52, 50)'     // Gray with subtle yellow tint
  };
  
  return BACKGROUND_TINTS[color];
}

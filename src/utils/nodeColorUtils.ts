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
 * Returns a very subtle rgba color for professional appearance
 */
export function getNodeBackgroundTint(nodeId: string): string {
  const color = getNodePaintColor(nodeId);
  
  // Ultra-subtle tints with very low opacity for professional look
  const BACKGROUND_TINTS: Record<PaintColorName, string> = {
    blue: 'rgba(59, 130, 246, 0.02)',    // Ultra-subtle blue tint
    green: 'rgba(34, 197, 94, 0.02)',    // Ultra-subtle green tint
    red: 'rgba(239, 68, 68, 0.02)',      // Ultra-subtle red tint
    yellow: 'rgba(234, 179, 8, 0.02)'    // Ultra-subtle yellow tint
  };
  
  return BACKGROUND_TINTS[color];
}

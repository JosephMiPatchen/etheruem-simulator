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
 * Uses a base gray with a transparent color overlay for easy tuning
 */
export function getNodeBackgroundTint(nodeId: string): string {
  const color = getNodePaintColor(nodeId);
  
  // Base light gray background color (lighter than the dark app background)
  const BASE_GRAY = 'rgb(49, 49, 49)';
  
  // Opacity for color overlay (tune this single value to adjust all tints)
  const COLOR_OPACITY = 0.01;
  
  // Color overlays with tunable opacity
  const COLOR_OVERLAYS: Record<PaintColorName, string> = {
    blue: `rgba(59, 130, 246, ${COLOR_OPACITY})`,
    green: `rgba(34, 197, 94, ${COLOR_OPACITY})`,
    red: `rgba(239, 68, 68, ${COLOR_OPACITY})`,
    yellow: `rgba(234, 179, 8, ${COLOR_OPACITY})`
  };
  
  // Create a linear-gradient that overlays the color on top of gray
  // This allows easy tuning via the COLOR_OPACITY constant
  return `linear-gradient(${COLOR_OVERLAYS[color]}, ${COLOR_OVERLAYS[color]}), ${BASE_GRAY}`;
}

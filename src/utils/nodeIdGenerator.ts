/**
 * Utility for generating memorable node IDs using color names
 */

// Color names for node IDs (matches paint colors)
const NODE_NAMES = [
  'Blue', 'Green', 'Red', 'Yellow'
];

/**
 * Generates a random node ID using a color name
 */
export function generateNodeId(): string {
  // Pick a random color name
  const randomIndex = Math.floor(Math.random() * NODE_NAMES.length);
  return NODE_NAMES[randomIndex];
}

/**
 * Generates an array of unique node IDs
 * @throws Error if count exceeds the number of available node names
 */
export function generateUniqueNodeIds(count: number): string[] {
  if (count > NODE_NAMES.length) {
    throw new Error(`Cannot generate more than ${NODE_NAMES.length} unique node IDs without duplicates`);
  }
  
  // Simply take the first N color names
  // This ensures deterministic naming: first node is Blue, second is Green, etc.
  return NODE_NAMES.slice(0, count);
}

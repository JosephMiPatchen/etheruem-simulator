/**
 * EPM Contract Initialization
 * 
 * Helper functions to create and initialize EPM contract accounts
 * for inclusion in the genesis block or world state.
 */

import { Account } from '../../types/types';
import { EPM } from './EPM';

/**
 * Load a Pokemon image and extract its pixel grid
 * This runs in Node.js environment, so we need to use a different approach than browser Canvas API
 * For now, we'll create a placeholder grid - in production, you'd load the actual image
 */
function createPixelGridPlaceholder(size: number = 128): number[][] {
  const grid: number[][] = [];
  
  // Create a simple pattern - a filled circle in the center
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size / 3;
  
  for (let y = 0; y < size; y++) {
    const row: number[] = [];
    for (let x = 0; x < size; x++) {
      // Calculate distance from center
      const dx = x - centerX;
      const dy = y - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Mark as paintable if within radius
      row.push(distance <= radius ? 1 : 0);
    }
    grid.push(row);
  }
  
  return grid;
}

/**
 * Create an EPM contract account for a specific Pokemon image
 * 
 * @param address - The contract address (e.g., '0xEPM_HIPPO')
 * @param imageFilename - The Pokemon image filename (e.g., 'hippo.png')
 * @returns An Account object with EPM storage initialized
 */
export function createEPMContract(address: string, imageFilename: string): Account {
  // TODO: In production, load actual image and extract pixel grid
  // For now, use a placeholder grid
  const pixelGrid = createPixelGridPlaceholder(128);
  
  // Initialize EPM contract storage
  const storage = EPM.initialize(pixelGrid);
  
  // Create the contract account
  const account: Account = {
    address,
    balance: 0,
    nonce: 0,
    code: imageFilename, // Store the Pokemon image filename in the code field
    storage,
    codeHash: `epm-${imageFilename}` // Unique code hash for this EPM contract
  };
  
  return account;
}

/**
 * Create the default EPM contract for the genesis block
 * This creates a hippo painting contract at address 0xEPM_HIPPO
 */
export function createGenesisEPMContract(): Account {
  return createEPMContract('0xEPM_HIPPO', 'hippo.png');
}

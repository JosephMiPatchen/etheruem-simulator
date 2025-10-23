/**
 * EPM (Ethereum Painting Machine)
 * 
 * A specialized smart contract that manages a collaborative painting game.
 * Four colors (blue, green, red, yellow) compete to paint pixels on a shared image.
 * 
 * GAME RULES:
 * - Contract is deployed with an image (stored as pixel grid)
 * - Players send transactions with ETH + color choice
 * - ETH amount determines % of TOTAL pixels painted (value * 2%)
 * - Pixels are selected deterministically using block hash as entropy
 * - First color to paint the most pixels wins!
 * 
 * STORAGE FORMAT:
 * - pixels: 2D array where each cell is a color ID
 *   0 = unpainted, 1 = blue, 2 = green, 3 = red, 4 = yellow
 * - colorCounts: Track how many pixels each color has painted
 * - totalPixels: Total number of pixels in the image
 * - balance: Total ETH held by the contract
 */

import { Account, EthereumTransaction } from '../../types/types';

// Color mapping
export enum PaintColor {
  UNPAINTED = 0,
  BLUE = 1,
  GREEN = 2,
  RED = 3,
  YELLOW = 4
}

export const COLOR_NAMES: Record<string, PaintColor> = {
  'blue': PaintColor.BLUE,
  'green': PaintColor.GREEN,
  'red': PaintColor.RED,
  'yellow': PaintColor.YELLOW
};

/**
 * Storage structure for the painting contract
 * This is what gets stored in Account.storage
 */
export interface EPMStorage {
  // Pixel grid: each cell is a PaintColor enum value
  pixels: number[][];
  
  // Track how many pixels each color has painted
  colorCounts: {
    [PaintColor.BLUE]: number;
    [PaintColor.GREEN]: number;
    [PaintColor.RED]: number;
    [PaintColor.YELLOW]: number;
  };
  
  // Total pixels in the image
  totalPixels: number;
  
  // Image dimensions
  width: number;
  height: number;
  
  // Contract balance (total ETH sent to contract)
  balance: number;
  
  // Winner information (set when painting is complete)
  winnerColor?: string;           // Winning color name
  winnerAddress?: string;          // Address that received the reward
  rewardAmount?: number;           // Amount of ETH rewarded to winner
  completedAtBlock?: string;       // Block hash when painting completed
}

/**
 * Paint transaction data
 */
export interface PaintTransactionData {
  color: string;  // "blue", "green", "red", or "yellow"
}

/**
 * Result of a paint operation
 */
export interface PaintResult {
  success: boolean;
  pixelsPainted: number;
  colorId: PaintColor;
  newBalance: number;
  error?: string;
}

/**
 * EPM - Ethereum Painting Machine
 * 
 * This class handles all the logic for the painting contract.
 * It's deterministic - same inputs always produce same outputs.
 */
export class EPM {
  /**
   * Initialize a new painting contract with an image
   * 
   * @param imageData - 2D array representing the image (1 = pixel exists, 0 = transparent)
   * @returns Initial storage state
   */
  static initialize(imageData: number[][]): EPMStorage {
    const height = imageData.length;
    const width = imageData[0]?.length || 0;
    
    // Initialize all pixels as unpainted
    const pixels: number[][] = imageData.map(row => 
      row.map(cell => cell === 1 ? PaintColor.UNPAINTED : -1) // -1 = not part of image
    );
    
    // Count total paintable pixels
    const totalPixels = pixels.flat().filter(p => p === PaintColor.UNPAINTED).length;
    
    return {
      pixels,
      colorCounts: {
        [PaintColor.BLUE]: 0,
        [PaintColor.GREEN]: 0,
        [PaintColor.RED]: 0,
        [PaintColor.YELLOW]: 0
      },
      totalPixels,
      width,
      height,
      balance: 0
    };
  }
  
  /**
   * Execute a paint transaction
   * 
   * @param storage - Current contract storage
   * @param value - ETH amount sent (determines % of pixels to paint)
   * @param data - Transaction data containing color choice
   * @param blockHash - Block hash for deterministic randomness
   * @returns Paint result and updated storage
   */
  static paint(
    storage: EPMStorage,
    value: number,
    data: string,
    blockHash: string
  ): { result: PaintResult; newStorage: EPMStorage } {
    // Parse transaction data
    let paintData: PaintTransactionData;
    try {
      paintData = JSON.parse(data);
    } catch (e) {
      return {
        result: {
          success: false,
          pixelsPainted: 0,
          colorId: PaintColor.UNPAINTED,
          newBalance: storage.balance,
          error: 'Invalid transaction data format'
        },
        newStorage: storage
      };
    }
    
    // Validate color
    const colorId = COLOR_NAMES[paintData.color.toLowerCase()];
    if (!colorId) {
      return {
        result: {
          success: false,
          pixelsPainted: 0,
          colorId: PaintColor.UNPAINTED,
          newBalance: storage.balance,
          error: `Invalid color: ${paintData.color}. Must be blue, green, red, or yellow`
        },
        newStorage: storage
      };
    }
    
    // Validate value
    if (value <= 0) {
      return {
        result: {
          success: false,
          pixelsPainted: 0,
          colorId,
          newBalance: storage.balance,
          error: 'Value must be positive'
        },
        newStorage: storage
      };
    }
    
    // Calculate how many pixels to paint (value * 2% of TOTAL pixels)
    const percentageToPaint = value * 2; // 10 ETH = 20%
    const pixelsToPaint = Math.floor((percentageToPaint / 100) * storage.totalPixels);
    
    if (pixelsToPaint === 0) {
      return {
        result: {
          success: false,
          pixelsPainted: 0,
          colorId,
          newBalance: storage.balance,
          error: 'Value too small to paint any pixels'
        },
        newStorage: storage
      };
    }
    
    // Find all unpainted pixels
    const unpaintedPixels: [number, number][] = [];
    for (let y = 0; y < storage.height; y++) {
      for (let x = 0; x < storage.width; x++) {
        if (storage.pixels[y][x] === PaintColor.UNPAINTED) {
          unpaintedPixels.push([y, x]);
        }
      }
    }
    
    if (unpaintedPixels.length === 0) {
      return {
        result: {
          success: false,
          pixelsPainted: 0,
          colorId,
          newBalance: storage.balance + value,
          error: 'No unpainted pixels remaining'
        },
        newStorage: {
          ...storage,
          balance: storage.balance + value
        }
      };
    }
    
    // Determine how many pixels we can actually paint
    const actualPixelsToPaint = Math.min(pixelsToPaint, unpaintedPixels.length);
    
    // Deep copy storage for mutation
    const newStorage: EPMStorage = {
      ...storage,
      pixels: storage.pixels.map(row => [...row]),
      colorCounts: { ...storage.colorCounts },
      balance: storage.balance + value
    };
    
    // Select pixels deterministically using block hash as seed
    const selectedPixels = this.selectPixelsDeterministically(
      unpaintedPixels,
      actualPixelsToPaint,
      blockHash
    );
    
    // Paint the selected pixels
    for (const [y, x] of selectedPixels) {
      newStorage.pixels[y][x] = colorId;
    }
    
    // Update color count
    newStorage.colorCounts[colorId] += actualPixelsToPaint;
    
    return {
      result: {
        success: true,
        pixelsPainted: actualPixelsToPaint,
        colorId,
        newBalance: newStorage.balance
      },
      newStorage
    };
  }
  
  /**
   * Deterministically select N pixels from available pixels using block hash as entropy
   * 
   * This uses the block hash to seed a deterministic shuffle algorithm.
   * All nodes will select the same pixels given the same inputs.
   * 
   * @param availablePixels - Array of [y, x] coordinates
   * @param count - How many pixels to select
   * @param blockHash - Block hash for entropy
   * @returns Array of selected pixel coordinates
   */
  private static selectPixelsDeterministically(
    availablePixels: [number, number][],
    count: number,
    blockHash: string
  ): [number, number][] {
    // Create a copy to avoid mutating input
    const pixels = [...availablePixels];
    const selected: [number, number][] = [];
    
    // Use block hash as seed for deterministic randomness
    let seed = parseInt(blockHash.slice(0, 16), 16);
    
    // Fisher-Yates shuffle with deterministic random
    for (let i = 0; i < count && pixels.length > 0; i++) {
      // Generate deterministic "random" index
      seed = (seed * 1103515245 + 12345) & 0x7fffffff; // Linear congruential generator
      const index = seed % pixels.length;
      
      // Select this pixel
      selected.push(pixels[index]);
      
      // Remove from available pixels
      pixels.splice(index, 1);
    }
    
    return selected;
  }
  
  /**
   * Execute a paint transaction on an EPM contract account
   * 
   * This is the main entry point for blockchain integration.
   * 
   * @param account - The smart contract account (must have EPM storage)
   * @param transaction - Ethereum transaction with paint data in the data field
   * @param blockHash - Hash of the block containing this transaction
   *                    CRITICAL: Block hash provides fresh entropy for deterministic randomness.
   *                    - Must be unpredictable (only known after mining)
   *                    - Must be deterministic (same hash = same pixel selection)
   *                    - Prevents players from cherry-picking favorable outcomes
   *                    This is how real Ethereum contracts get fair randomness!
   * 
   * @returns Updated account with mutated storage and balance
   */
  static executeTransaction(
    account: Account,
    transaction: EthereumTransaction,
    blockHash: string,
    worldState?: { [address: string]: Account }
  ): { success: boolean; account: Account; error?: string; winnerReward?: { address: string; amount: number } } {
    // Validate account has EPM storage
    if (!account.storage || !account.storage.pixels) {
      return {
        success: false,
        account,
        error: 'Account does not have EPM contract storage'
      };
    }
    
    // Parse transaction data
    if (!transaction.data) {
      return {
        success: false,
        account,
        error: 'Transaction missing data field'
      };
    }
    
    // Execute paint operation
    const { result, newStorage } = this.paint(
      account.storage as EPMStorage,
      transaction.value,
      transaction.data,
      blockHash
    );
    
    if (!result.success) {
      return {
        success: false,
        account,
        error: result.error
      };
    }
    
    // Update account with new storage and balance
    let updatedAccount = {
      ...account,
      storage: newStorage,
      balance: account.balance + transaction.value
    };
    
    // Check if painting is now complete (all pixels painted)
    const totalPainted = Object.values(newStorage.colorCounts).reduce((sum, count) => sum + count, 0);
    const isPaintingComplete = totalPainted === newStorage.totalPixels;
    
    let winnerReward: { address: string; amount: number } | undefined;
    
    // If painting just completed, reward the winner
    if (isPaintingComplete && !newStorage.winnerAddress) {
      // Determine winner (color with most pixels)
      const winner = this.getWinner(newStorage);
      
      if (winner && worldState) {
        // Find the address that paints the winning color
        // Each node paints a specific color, so we need to find which address
        // has been painting this winning color
        let winnerAddress: string | null = null;
        
        // Look through all addresses to find one that paints the winning color
        for (const [address] of Object.entries(worldState)) {
          // Skip the contract itself
          if (address === '0xEPM_PAINT_CONTRACT') continue;
          
          // Check recent transactions from this address to see what color they paint
          // For now, we'll use a simpler approach: map color to node name
          // Blue node paints blue, Green node paints green, etc.
          const nodeId = address.split('_')[0]; // Extract node name from address
          
          // Map node names to colors (matches our nodeColorUtils)
          const nodeColorMap: { [key: string]: string } = {
            'Blue': 'blue',
            'Green': 'green',
            'Red': 'red',
            'Yellow': 'yellow'
          };
          
          if (nodeColorMap[nodeId] === winner.color) {
            winnerAddress = address;
            break;
          }
        }
        
        // Fallback: if we can't find the winner address, use transaction sender
        if (!winnerAddress) {
          winnerAddress = transaction.from;
          console.warn(`Could not find address for winning color ${winner.color}, using transaction sender`);
        }
        
        const rewardAmount = updatedAccount.balance;
        
        // Update storage with winner information
        const finalStorage = {
          ...newStorage,
          winnerColor: winner.color,
          winnerAddress: winnerAddress,
          rewardAmount: rewardAmount,
          completedAtBlock: blockHash
        };
        
        // Set contract balance to 0 (all ETH goes to winner)
        updatedAccount = {
          ...updatedAccount,
          storage: finalStorage,
          balance: 0
        };
        
        // Return winner reward info so WorldState can update winner's balance
        winnerReward = {
          address: winnerAddress,
          amount: rewardAmount
        };
        
        console.log(`🎉 Painting complete! Winner: ${winner.color} (${winnerAddress}). Reward: ${rewardAmount} ETH`);
      }
    }
    
    return {
      success: true,
      account: updatedAccount,
      winnerReward
    };
  }
  
  /**
   * Get the current winner (color with most pixels painted)
   */
  static getWinner(storage: EPMStorage): { color: string; count: number } | null {
    const counts = storage.colorCounts;
    let maxCount = 0;
    let winner: PaintColor | null = null;
    
    for (const [colorId, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        winner = parseInt(colorId) as PaintColor;
      }
    }
    
    if (!winner) return null;
    
    const colorName = Object.keys(COLOR_NAMES).find(
      key => COLOR_NAMES[key] === winner
    );
    
    return {
      color: colorName || 'unknown',
      count: maxCount
    };
  }
}

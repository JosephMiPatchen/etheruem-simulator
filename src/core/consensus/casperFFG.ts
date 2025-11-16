import { Block } from '../../types/types';
import { SimulatorConfig } from '../../config/config';

/**
 * Casper FFG (Finality Gadget) Implementation
 * 
 * Handles checkpoint computation for Ethereum's finality mechanism.
 * Checkpoints are epoch boundaries where finality votes are cast.
 */
export class CasperFFG {
  
  /**
   * Compute FFG source and target checkpoints for an attestation
   * 
   * Algorithm:
   * 1. Calculate target epoch from current slot (current epoch)
   * 2. Calculate source epoch (previous justified epoch, for now = target - 1)
   * 3. For each epoch, find the checkpoint slot (first slot of epoch)
   * 4. Search canonical chain for the block at or before checkpoint slot
   * 
   * @param currentSlot - The current slot when creating attestation
   * @param canonicalChain - Array of blocks from genesis to current head
   * @returns FFG source and target checkpoints with epoch and root (block hash)
   */
  static computeCheckpoints(
    currentSlot: number,
    canonicalChain: Block[]
  ): {
    source: { epoch: number; root: string };
    target: { epoch: number; root: string };
  } {
    // Calculate target epoch (current epoch)
    const targetEpoch = Math.floor(currentSlot / SimulatorConfig.SLOTS_PER_EPOCH);
    
    // Calculate source epoch (previous epoch)
    // In full Casper FFG, this would be the last justified epoch
    // For now, we use previous epoch as a simplification
    const sourceEpoch = Math.max(0, targetEpoch - 1);
    
    // Find checkpoint blocks for source and target epochs
    const sourceCheckpoint = this.findCheckpointBlock(sourceEpoch, canonicalChain);
    const targetCheckpoint = this.findCheckpointBlock(targetEpoch, canonicalChain);
    
    return {
      source: {
        epoch: sourceEpoch,
        root: sourceCheckpoint
      },
      target: {
        epoch: targetEpoch,
        root: targetCheckpoint
      }
    };
  }
  
  /**
   * Find the checkpoint block for a given epoch
   * 
   * The checkpoint is the first slot of the epoch, but if that slot is empty,
   * we return the highest block at or before that slot.
   * 
   * Algorithm:
   * 1. Calculate checkpoint slot = epoch * SLOTS_PER_EPOCH
   * 2. Search canonical chain backwards from head
   * 3. Return first block with slot <= checkpoint slot
   * 4. If no block found (epoch 0 before genesis), return genesis hash
   * 
   * @param epoch - The epoch to find checkpoint for
   * @param canonicalChain - Array of blocks from genesis to current head
   * @returns Block hash of the checkpoint block
   */
  private static findCheckpointBlock(
    epoch: number,
    canonicalChain: Block[]
  ): string {
    // Calculate the checkpoint slot (first slot of epoch)
    const checkpointSlot = epoch * SimulatorConfig.SLOTS_PER_EPOCH;
    
    // Handle edge case: epoch 0 or empty chain
    if (canonicalChain.length === 0) {
      return SimulatorConfig.GENESIS_PREV_HASH; // Return zero hash if no blocks
    }
    
    // Search backwards through canonical chain to find block at or before checkpoint slot
    for (let i = canonicalChain.length - 1; i >= 0; i--) {
      const block = canonicalChain[i];
      if (block.header.slot <= checkpointSlot) {
        // Found the checkpoint block (or closest block before checkpoint)
        return block.hash || '';
      }
    }
    
    // If no block found (shouldn't happen if genesis exists), return genesis
    return canonicalChain[0]?.hash || SimulatorConfig.GENESIS_PREV_HASH;
  }
  
  /**
   * Get the checkpoint slot for a given epoch
   * Checkpoint slot is the first slot of the epoch
   * 
   * @param epoch - The epoch number
   * @returns The slot number of the checkpoint
   */
  static getCheckpointSlot(epoch: number): number {
    return epoch * SimulatorConfig.SLOTS_PER_EPOCH;
  }
  
  /**
   * Get the epoch for a given slot
   * 
   * @param slot - The slot number
   * @returns The epoch number
   */
  static getEpoch(slot: number): number {
    return Math.floor(slot / SimulatorConfig.SLOTS_PER_EPOCH);
  }
}

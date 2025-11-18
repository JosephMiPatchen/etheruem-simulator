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
  
  /**
   * Apply attestations from a block to BeaconState for Casper FFG finality tracking
   * 
   * Algorithm:
   * 1. For each attestation, remove validator's old vote from vote buckets
   * 2. Record attestation as validator's latest included attestation
   * 3. If attestation's source matches current justified checkpoint, count the vote
   * 4. Add validator to target epoch/root vote bucket
   * 5. Check if target has reached 2/3 threshold to justify
   * 6. If justified and previous justified are consecutive epochs, finalize previous
   * 7. Garbage collect old vote buckets
   * 
   * @param beaconState - BeaconState to update
   * @param attestationsInBlock - Attestations included in the block
   */
  static applyAttestationsToBeaconState(
    beaconState: any,
    attestationsInBlock: any[]
  ): void {
    // Compute 2/3 threshold based on validator count
    const threshold = Math.ceil((2 * beaconState.validators.length) / 3);
    
    // Current justified checkpoint (attestations must have source == this to be counted)
    const currentJustified = beaconState.justifiedCheckpoint;
    
    // Process each attestation in the block
    for (const att of attestationsInBlock) {
      const validator = att.validatorAddress;
      
      // 1) Remove old vote from vote buckets if validator had a previous attestation
      const old = beaconState.latestAttestationByValidator[validator];
      if (old && old.ffgTarget) {
        this.removeVoteFromBucket(beaconState, old.ffgTarget.epoch, old.ffgTarget.root, validator);
      }
      
      // 2) Record this attestation as the validator's latest included attestation
      beaconState.latestAttestationByValidator[validator] = att;
      
      // 3) Check if attestation is countable for FFG (source must match current justified)
      if (!att.ffgSource || !att.ffgTarget) continue;
      if (!currentJustified || 
          att.ffgSource.epoch !== currentJustified.epoch || 
          att.ffgSource.root !== currentJustified.root) {
        continue; // Not countable - ignore for votes
      }
      
      // 4) Add validator to the target bucket for this attestation's target epoch/root
      const targetEpoch = att.ffgTarget.epoch;
      const targetRoot = att.ffgTarget.root;
      const epochBucket = this.getOrCreateEpochBucket(beaconState, targetEpoch);
      const targetSet = this.getOrCreateTargetSet(epochBucket, targetRoot);
      targetSet.add(validator);
      
      // 5) Attempt to update justified/finalized based on the changed bucket
      this.tryUpdateJustifiedAndFinalized(beaconState, targetEpoch, targetRoot, threshold);
    }
    
    // 6) Garbage collect old vote buckets
    this.garbageCollectUpToFinalized(beaconState);
  }
  
  /**
   * Get or create epoch bucket in ffgVoteCounts
   */
  private static getOrCreateEpochBucket(state: any, epoch: number): Record<string, Set<string>> {
    if (!state.ffgVoteCounts[epoch]) {
      state.ffgVoteCounts[epoch] = {};
    }
    return state.ffgVoteCounts[epoch];
  }
  
  /**
   * Get or create Set for a target root inside an epoch bucket
   */
  private static getOrCreateTargetSet(epochBucket: Record<string, Set<string>>, root: string): Set<string> {
    if (!epochBucket[root]) {
      epochBucket[root] = new Set<string>();
    }
    return epochBucket[root];
  }
  
  /**
   * Remove a validator's vote from a given epoch/root bucket
   */
  private static removeVoteFromBucket(
    state: any,
    epoch: number,
    root: string,
    validator: string
  ): void {
    const epochBucket = state.ffgVoteCounts[epoch];
    if (!epochBucket) return;
    
    const voters = epochBucket[root];
    if (!voters) return;
    
    voters.delete(validator);
    
    // Clean up empty data structures
    if (voters.size === 0) {
      delete epochBucket[root];
    }
    if (Object.keys(epochBucket).length === 0) {
      delete state.ffgVoteCounts[epoch];
    }
  }
  
  /**
   * Try to promote a (epoch, root) to justified and possibly finalize previous
   */
  private static tryUpdateJustifiedAndFinalized(
    state: any,
    candidateEpoch: number,
    candidateRoot: string,
    threshold: number
  ): void {
    const epochBucket = state.ffgVoteCounts[candidateEpoch];
    if (!epochBucket) return;
    
    const voters = epochBucket[candidateRoot];
    if (!voters) return;
    
    // Not enough votes to justify
    if (voters.size < threshold) return;
    
    const currentJustifiedEpoch = state.justifiedCheckpoint?.epoch ?? -1;
    
    // Only move justified forward (monotonicity)
    if (candidateEpoch <= currentJustifiedEpoch) return;
    
    console.log(`[CasperFFG] Justifying epoch ${candidateEpoch} with ${voters.size}/${threshold} votes`);
    
    // Promote: previousJustified <- justified, justified <- candidate
    state.previousJustifiedCheckpoint = { ...state.justifiedCheckpoint };
    state.justifiedCheckpoint = { epoch: candidateEpoch, root: candidateRoot };
    
    // If previous and current justified are consecutive epochs, finalize the previous
    if (state.previousJustifiedCheckpoint &&
        state.previousJustifiedCheckpoint.epoch + 1 === state.justifiedCheckpoint.epoch) {
      state.finalizedCheckpoint = { ...state.previousJustifiedCheckpoint };
      console.log(`[CasperFFG] Finalized epoch ${state.finalizedCheckpoint.epoch}`);
    }
  }
  
  /**
   * Garbage collect vote buckets for epochs <= finalizedEpoch
   */
  private static garbageCollectUpToFinalized(state: any): void {
    const finalizedEpoch = state.finalizedCheckpoint?.epoch;
    if (finalizedEpoch === undefined || finalizedEpoch === null) return;
    
    for (const epochKey of Object.keys(state.ffgVoteCounts)) {
      const epochNum = Number(epochKey);
      if (!Number.isNaN(epochNum) && epochNum <= finalizedEpoch) {
        delete state.ffgVoteCounts[epochNum];
      }
    }
  }
}

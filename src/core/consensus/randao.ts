/**
 * RANDAO - Random beacon for validator scheduling in Ethereum PoS
 * 
 * Implements the RANDAO mechanism for generating unpredictable randomness
 * and computing proposer schedules for upcoming epochs.
 */

import { BeaconState } from './beaconState';
import { SimulatorConfig } from '../../config/config';
import { 
  hexToBytes, 
  generateBLSSignature,
  i2b8,
  concat,
  u64,
  xorHexStrings,
  hashBytes
} from '../../utils/cryptoUtils';
import { Node } from '../node';

export class RANDAO {

  /**
   * Computes the proposer schedule for the next epoch (32 slots)
   * Uses RANDAO mix for unpredictable but deterministic validator selection
   * Validators are weighted by their effective balance (stake)
   * 
   * @param state - Current beacon state with validators and RANDAO mix
   * @returns Array of 32 validator addresses (one per slot in next epoch)
   */
  static getProposerSchedule(state: BeaconState): string[] {
    const currentEpoch = state.getCurrentEpoch();
    const nextEpoch = currentEpoch + 1;

    // Use current epoch's RANDAO mix as the randomness seed for next epoch's schedule
    // This ensures unpredictability (can't predict future RANDAO reveals)
    // but determinism (all nodes compute same schedule from same state)
    const currentEpochMix = state.getRandaoMix(currentEpoch);
    const epochSeedBytes = hexToBytes(currentEpochMix);

    // Build list of active validators with their effective balance
    // Effective balance is capped at MAX_EFFECTIVE_BALANCE (32 ETH)
    // This prevents any single validator from dominating the selection
    const activeValidators = state.validators
      .map((validator, validatorIndex) => ({ 
        validatorIndex, 
        validator, 
        effectiveBalance: Math.min(
          Math.max(validator.stakedEth, 0), 
          SimulatorConfig.MAX_EFFECTIVE_BALANCE
        ) 
      }))
      .filter(v => v.effectiveBalance > 0);

    if (activeValidators.length === 0) {
      throw new Error("No active validators with positive stake");
    }

    const proposerSchedule: string[] = [];

    // Compute proposer for each of the 32 slots in the next epoch
    for (let slotIndexInEpoch = 0; slotIndexInEpoch < SimulatorConfig.SLOTS_PER_EPOCH; slotIndexInEpoch++) {
      const absoluteSlotNumber = nextEpoch * SimulatorConfig.SLOTS_PER_EPOCH + slotIndexInEpoch;

      // Create unique seed for this specific slot by hashing: H(epochSeed || slotNumber)
      // This ensures each slot has independent randomness
      const slotSeedBytes = hashBytes(concat(epochSeedBytes, i2b8(absoluteSlotNumber)));

      // Weighted random selection using "sample-until-accepted" algorithm
      // This is the Ethereum spec's method for stake-weighted validator selection
      let samplingAttempt = 0;
      
      while (true) {
        // Generate fresh randomness for each sampling attempt: H(slotSeed || attempt)
        const randomnessBytes = hashBytes(concat(slotSeedBytes, i2b8(samplingAttempt++)));

        // Select a candidate validator uniformly at random from active set
        // Use first 8 bytes of hash as random number, mod by validator count
        const candidateIndex = u64(randomnessBytes, 0) % activeValidators.length;
        const candidate = activeValidators[candidateIndex];

        // Weighted acceptance test: Accept with probability = effectiveBalance / MAX_EFFECTIVE_BALANCE
        // This gives validators with more stake a higher chance of being selected
        // 
        // How it works:
        // - randomByte is uniform random in [0, 255]
        // - We accept if: randomByte < (effectiveBalance / MAX_EFFECTIVE_BALANCE) * 256
        // - Rearranged: randomByte * MAX_EFFECTIVE_BALANCE < effectiveBalance * 256
        // - We use 255 instead of 256 to avoid overflow (close enough approximation)
        //
        // Example: If validator has 16 ETH (half of 32 ETH max):
        //   - Accept if randomByte < 128 (50% chance)
        // Example: If validator has 32 ETH (max):
        //   - Accept if randomByte < 255 (≈100% chance)
        const randomByte = randomnessBytes[8]; // Use 9th byte as random value [0-255]
        const acceptanceThreshold = (candidate.effectiveBalance * 255) / SimulatorConfig.MAX_EFFECTIVE_BALANCE;
        
        if (randomByte <= acceptanceThreshold) {
          // Candidate accepted! Add their address to the schedule
          proposerSchedule.push(state.validators[candidate.validatorIndex].nodeAddress);
          break; // Move to next slot
        }
        // Candidate rejected, try again with new randomness (samplingAttempt++)
      }
    }

    return proposerSchedule;
  }

  /**
   * Calculate RANDAO reveal for a given epoch
   * This is the BLS signature of the epoch number using the node's private key
   * 
   * @param epoch - The epoch to create reveal for
   * @param node - The node creating the reveal (to get private key)
   * @returns RANDAO reveal as hex string
   */
  static calculateRandaoReveal(epoch: number, node: Node): string {
    // Get the node's private key
    const privateKey = node.getPrivateKey();
    
    // Create message to sign: "RANDAO_REVEAL_" + epoch
    const message = `RANDAO_REVEAL_${epoch}`;
    
    // Sign the message using BLS signature
    // In real Ethereum, this would use the validator's BLS key
    const signature = generateBLSSignature(message, privateKey);
    
    return signature;
  }

  /**
   * Update RANDAO mix for an epoch with a new reveal
   * new_mix = current_mix XOR reveal
   * 
   * @param state - Beacon state to update
   * @param epoch - Epoch to update mix for
   * @param reveal - RANDAO reveal to mix in
   */
  static updateRandaoMix(state: BeaconState, epoch: number, reveal: string): void {
    const currentMix = state.getRandaoMix(epoch);
    const newMix = xorHexStrings(currentMix, reveal);
    state.updateRandaoMix(epoch, newMix);
  }

}

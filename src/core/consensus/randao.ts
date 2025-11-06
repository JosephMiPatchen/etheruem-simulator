/**
 * RANDAO - Random beacon for validator scheduling in Ethereum PoS
 * 
 * Implements the RANDAO mechanism for generating unpredictable randomness
 * and computing proposer schedules for upcoming epochs.
 */

import { BeaconState } from './beaconState';
import { SimulatorConfig } from '../../config/config';
import { 
  sha256Hash, 
  hexToBytes, 
  bytesToHex,
  generateBLSSignature,
  i2b8,
  concat,
  u64,
  xorHexStrings
} from '../../utils/cryptoUtils';
import { Node } from '../node';

export class RANDAO {

  /**
   * Returns 32 proposer addresses (one per slot of the *next* epoch)
   * Uses current epoch's RANDAO mix as seed for next epoch's schedule
   */
  static getProposerSchedule(state: BeaconState): string[] {
    const currentEpoch = state.getCurrentEpoch();
    const nextEpoch = currentEpoch + 1;

    // Seed: use current epoch's mix to schedule the next
    const mix = state.getRandaoMix(currentEpoch);
    const epochSeed = hexToBytes(mix);

    // Active set (all validators with positive stake)
    const active = state.validators
      .map((v, i) => ({ 
        i, 
        v, 
        eff: Math.min(Math.max(v.stakedEth, 0), SimulatorConfig.MAX_EFFECTIVE_BALANCE) 
      }))
      .filter(x => x.eff > 0);

    if (active.length === 0) {
      throw new Error("No active validators");
    }

    const schedule: string[] = [];

    for (let idxInEpoch = 0; idxInEpoch < SimulatorConfig.SLOTS_PER_EPOCH; idxInEpoch++) {
      const slot = nextEpoch * SimulatorConfig.SLOTS_PER_EPOCH + idxInEpoch;

      // Per-slot seed = H(epochSeed || slot)
      const slotSeed = this.hashBytes(concat(epochSeed, i2b8(slot)));

      // Sample-until-accepted (spec-style), weighted by effective balance
      let counter = 0;
      // Loop terminates quickly in practice (probability proportional to eff / MAX_EFFECTIVE_BALANCE)
      while (true) {
        const h = this.hashBytes(concat(slotSeed, i2b8(counter++)));

        // Candidate index from first 8 bytes (mod active size)
        const cand = active[u64(h, 0) % active.length];

        // Weighted accept: use next byte as randomness
        const randByte = h[8]; // 0..255
        if (randByte * SimulatorConfig.MAX_EFFECTIVE_BALANCE <= cand.eff * 255) {
          schedule.push(state.validators[cand.i].nodeAddress);
          break;
        }
      }
    }

    return schedule;
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

  // ============================================================================
  // Static Helper Methods
  // ============================================================================

  /**
   * Hash bytes using SHA-256
   * @param bytes - Bytes to hash
   * @returns Hash as Uint8Array
   */
  private static hashBytes(bytes: Uint8Array): Uint8Array {
    // Convert bytes to hex string for sha256Hash function
    const hexString = bytesToHex(bytes);
    
    // Use SHA-256 from cryptoUtils
    const hashHex = sha256Hash(hexString);
    
    // Convert back to bytes
    return hexToBytes(hashHex);
  }

}

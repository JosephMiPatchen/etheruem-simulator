/**
 * BeaconState - Consensus Layer (CL) state for Ethereum PoS
 * 
 * This represents the beacon chain state that will eventually be used
 * for validator scheduling, RANDAO, and consensus.
 */

export interface Validator {
  nodeAddress: string;
  stakedEth: number; // Amount of ETH staked (typically 32 ETH)
}

export interface Attestation {
  validatorAddress: string;
  blockHash: string;
  timestamp: number;
}

export class BeaconState {
  // RANDAO mixes - one per epoch, continuously updated with XOR
  public randaoMixes: Map<number, string>; // epoch -> random mix
  
  // Current epoch schedule - maps slot to validator node ID
  public currentEpochSchedule: Map<number, string>; // slot -> nodeId
  
  // List of validators with their staked ETH
  public validators: Validator[];
  
  // Genesis timestamp in UTC seconds
  public genesisTime: number;
  
  // Beacon pool - accumulates attestations from validators
  public beaconPool: Attestation[];
  
  constructor(genesisTime: number, validators: Validator[]) {
    this.genesisTime = genesisTime;
    this.validators = validators;
    this.randaoMixes = new Map();
    this.currentEpochSchedule = new Map();
    this.beaconPool = [];
    
    // Initialize first RANDAO mix for epoch 0
    this.randaoMixes.set(0, this.generateInitialRandao());
  }
  
  /**
   * Get current slot based on time
   * Slot = (current_utc_secs - genesis_utc_secs) / 12
   */
  getCurrentSlot(): number {
    const currentTime = Math.floor(Date.now() / 1000); // Current UTC in seconds
    const timeSinceGenesis = currentTime - this.genesisTime;
    return Math.floor(timeSinceGenesis / 12);
  }
  
  /**
   * Get current epoch based on time
   * Epoch = ((current_utc_secs - genesis_utc_secs) / 12) / 32
   */
  getCurrentEpoch(): number {
    const currentSlot = this.getCurrentSlot();
    return Math.floor(currentSlot / 32);
  }
  
  /**
   * Update RANDAO mix for an epoch
   * new_mix = current_mix XOR next_reveal
   */
  updateRandaoMix(epoch: number, reveal: string): void {
    const currentMix = this.randaoMixes.get(epoch) || this.generateInitialRandao();
    const newMix = this.xorHexStrings(currentMix, reveal);
    this.randaoMixes.set(epoch, newMix);
  }
  
  /**
   * Get RANDAO mix for a specific epoch
   */
  getRandaoMix(epoch: number): string {
    return this.randaoMixes.get(epoch) || this.generateInitialRandao();
  }
  
  /**
   * Get validator assigned to a specific slot
   */
  getValidatorForSlot(slot: number): string | undefined {
    return this.currentEpochSchedule.get(slot);
  }
  
  /**
   * Set validator schedule for current epoch
   */
  setEpochSchedule(schedule: Map<number, string>): void {
    this.currentEpochSchedule = schedule;
  }
  
  /**
   * Add an attestation to the beacon pool
   */
  addAttestation(attestation: Attestation): void {
    this.beaconPool.push(attestation);
  }
  
  /**
   * Get all attestations in the beacon pool
   */
  getBeaconPool(): Attestation[] {
    return this.beaconPool;
  }
  
  /**
   * Get attestations for a specific block hash
   */
  getAttestationsForBlock(blockHash: string): Attestation[] {
    return this.beaconPool.filter(att => att.blockHash === blockHash);
  }
  
  /**
   * Generate initial RANDAO mix (placeholder for now)
   */
  private generateInitialRandao(): string {
    // Simple initial value - in real Ethereum this would be more complex
    return '0'.repeat(64);
  }
  
  /**
   * XOR two hex strings
   */
  private xorHexStrings(hex1: string, hex2: string): string {
    // Ensure both strings are same length
    const maxLen = Math.max(hex1.length, hex2.length);
    const padded1 = hex1.padStart(maxLen, '0');
    const padded2 = hex2.padStart(maxLen, '0');
    
    let result = '';
    for (let i = 0; i < maxLen; i++) {
      const xor = parseInt(padded1[i], 16) ^ parseInt(padded2[i], 16);
      result += xor.toString(16);
    }
    return result;
  }
  
  /**
   * Serialize beacon state to JSON
   */
  toJSON() {
    return {
      genesisTime: this.genesisTime,
      currentSlot: this.getCurrentSlot(),
      currentEpoch: this.getCurrentEpoch(),
      validators: this.validators,
      randaoMixes: Array.from(this.randaoMixes.entries()),
      currentEpochSchedule: Array.from(this.currentEpochSchedule.entries()),
    };
  }
}

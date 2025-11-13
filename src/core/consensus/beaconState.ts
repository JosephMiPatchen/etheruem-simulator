import { LmdGhost } from './LmdGhost';
import { SimulatorConfig } from '../../config/config';

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
  
  // Proposer schedules - maps epoch to (slot -> validator address)
  // Shows which validator proposes at each slot in each epoch
  public proposerSchedules: Map<number, Map<number, string>>; // epoch -> (slot -> validator address)
  
  // List of validators with their staked ETH
  public validators: Validator[];
  
  // Genesis timestamp in UTC seconds
  public genesisTime: number;
  
  // Beacon pool - accumulates attestations from validators
  public beaconPool: Attestation[];
  
  // Set of processed attestations (key: "blockHash-validatorAddress")
  // Tracks attestations that have been included in blocks to prevent duplicates
  public processedAttestations: Set<string>;
  
  // LMD-GHOST fork choice state
  // Latest attestations from each validator (for LMD GHOST fork choice)
  public latestAttestations: Map<string, Attestation>;
  
  // Reference to blockchain for triggering tree updates (set after construction)
  private blockchain?: any;
  
  constructor(genesisTime: number, validators: Validator[]) {
    this.genesisTime = genesisTime;
    this.validators = validators;
    this.randaoMixes = new Map();
    this.proposerSchedules = new Map();
    this.beaconPool = [];
    this.processedAttestations = new Set();
    
    // Initialize LMD-GHOST fork choice state
    this.latestAttestations = new Map();
    
    // Initialize RANDAO mix for epoch -1 (genesis)
    // This allows epoch 0 to compute its proposer schedule
    this.randaoMixes.set(-1, SimulatorConfig.GENESIS_RANDAO_MIX);
  }
  
  /**
   * Set blockchain reference for triggering tree updates
   * Called by Blockchain after construction
   */
  setBlockchain(blockchain: any): void {
    this.blockchain = blockchain;
  }
  
  /**
   * Get current slot based on time since genesis
   * Slot = (current_time - genesis_time) / SECONDS_PER_SLOT
   */
  getCurrentSlot(): number {
    const currentTime = Math.floor(Date.now() / 1000); // Current UTC in seconds
    const timeSinceGenesis = currentTime - this.genesisTime;
    return Math.floor(timeSinceGenesis / SimulatorConfig.SECONDS_PER_SLOT);
  }
  
  /**
   * Get current epoch based on time
   * Epoch = currentSlot / SLOTS_PER_EPOCH
   */
  getCurrentEpoch(): number {
    const currentSlot = this.getCurrentSlot();
    return Math.floor(currentSlot / SimulatorConfig.SLOTS_PER_EPOCH);
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
    const mix = this.randaoMixes.get(epoch);
    if (!mix) {
      console.warn(`[BeaconState] ⚠️  No RANDAO mix found for epoch ${epoch}, falling back to default (all zeros). RANDAO reveals are not being processed!`);
      return this.generateInitialRandao();
    }
    return mix;
  }
  
  /**
   * Get the current proposer for the current slot
   * Fetches from the proposer schedule based on current time
   */
  getCurrentProposer(): string | null {
    const currentSlot = this.getCurrentSlot();
    return this.getValidatorForSlot(currentSlot) || null;
  }
  
  /**
   * Get validator assigned to a specific slot
   * Looks up the proposer from the proposerSchedules map
   */
  getValidatorForSlot(slot: number): string | undefined {
    // Calculate which epoch this slot belongs to
    const epoch = Math.floor(slot / SimulatorConfig.SLOTS_PER_EPOCH);
    
    // Get the schedule for that epoch
    const epochSchedule = this.proposerSchedules.get(epoch);
    if (!epochSchedule) {
      return undefined;
    }
    
    // Return the validator for this slot
    return epochSchedule.get(slot);
  }
  
  /**
   * Add an attestation to the beacon pool
   * Called when an attestation message is received from the network
   * 
   * Delegates to blockchain.onAttestationReceived which:
   * - Updates latest attestations
   * - Validates blocks if GHOST-HEAD changes
   * - Checks for reorg (GHOST-HEAD change)
   * - Rebuilds state if needed
   */
  async addAttestation(attestation: Attestation): Promise<void> {
    // Check if this exact attestation already exists (same validator + block hash)
    const exists = this.beaconPool.some(
      att => att.validatorAddress === attestation.validatorAddress && 
             att.blockHash === attestation.blockHash
    );
    
    if (!exists) {
      this.beaconPool.push(attestation);
      
      // Delegate to blockchain to handle attestation and check for reorg
      // This is the ONLY way reorgs can happen (not via block/chain addition)
      if (this.blockchain) {
        await this.blockchain.onAttestationReceived(attestation);
      }
    }
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
   * Flush (remove) attestations for a specific block hash from the beacon pool
   * This is called after a block is validated and added to the chain
   * Removes attestations based on blockHash + validatorAddress combination
   */
  flushAttestationsForBlock(blockHash: string): void {
    this.beaconPool = this.beaconPool.filter(att => att.blockHash !== blockHash);
  }
  
  /**
   * Create attestation key for tracking processed attestations
   */
  private getAttestationKey(blockHash: string, validatorAddress: string): string {
    return `${blockHash}-${validatorAddress}`;
  }
  
  /**
   * Mark an attestation as processed (included in a block)
   */
  markAttestationAsProcessed(blockHash: string, validatorAddress: string): void {
    const key = this.getAttestationKey(blockHash, validatorAddress);
    this.processedAttestations.add(key);
    console.log(`[BeaconState] Marked as processed: ${key.slice(0, 20)}... (total: ${this.processedAttestations.size})`);
  }
  
  /**
   * Check if an attestation has already been processed
   */
  isAttestationProcessed(blockHash: string, validatorAddress: string): boolean {
    const key = this.getAttestationKey(blockHash, validatorAddress);
    const isProcessed = this.processedAttestations.has(key);
    if (isProcessed) {
      console.log(`[BeaconState] DUPLICATE DETECTED: ${key.slice(0, 20)}... already processed`);
    }
    return isProcessed;
  }
  
  /**
   * Clear processed attestations set (called on chain reorganization)
   */
  clearProcessedAttestations(): void {
    this.processedAttestations.clear();
  }
  
  /**
   * Clear RANDAO mixes and proposer schedules
   * Called during reorg - they will be rebuilt as blocks are reapplied
   * 
   * RANDAO mixes: Rebuilt by applyBlockToElAndClState for each block
   * Proposer schedules: Recomputed lazily by Consensus when needed
   */
  clearRandaoState(): void {
    this.randaoMixes.clear();
    this.proposerSchedules.clear();
    
    // Re-initialize genesis RANDAO mix (epoch -1)
    this.randaoMixes.set(-1, SimulatorConfig.GENESIS_RANDAO_MIX);
  }
  
  /**
   * Rebuild processed attestations set from a chain of blocks
   * Called when world state is rebuilt (e.g., during chain replacement)
   */
  rebuildProcessedAttestations(blocks: any[]): void {
    console.log(`[BeaconState] REBUILDING processedAttestations from ${blocks.length} blocks`);
    
    // Clear existing set
    const oldSize = this.processedAttestations.size;
    this.processedAttestations.clear();
    console.log(`[BeaconState] Cleared ${oldSize} old processed attestations`);
    
    // Add all attestations from all blocks in the chain
    let totalAttestations = 0;
    for (const block of blocks) {
      if (block.attestations && block.attestations.length > 0) {
        console.log(`[BeaconState] Block ${block.hash?.slice(0, 8)} has ${block.attestations.length} attestations`);
        for (const attestation of block.attestations) {
          this.markAttestationAsProcessed(attestation.blockHash, attestation.validatorAddress);
          totalAttestations++;
        }
      }
    }
    console.log(`[BeaconState] REBUILD COMPLETE: ${totalAttestations} attestations marked as processed`);
  }
  
  /**
   * Get validator's staked ETH by address
   * Returns 0 if validator not found
   */
  getValidatorStake(validatorAddress: string): number {
    const validator = this.validators.find(v => v.nodeAddress === validatorAddress);
    return validator ? validator.stakedEth : 0;
  }
  
  /**
   * Update latest attestation for a validator if the new one is more recent
   * Returns true if updated, false if existing attestation was newer
   */
  updateLatestAttestation(attestation: Attestation): boolean {
    const existing = this.latestAttestations.get(attestation.validatorAddress);
    
    // If no existing attestation or new one is more recent, update
    if (!existing || attestation.timestamp > existing.timestamp) {
      LmdGhost.recordAttestation(this, attestation);
      return true;
    }
    
    return false;
  }
  
  /**
   * Update tree decoration with current latest attestations
   * Called when new attestations arrive
   * 
   * Simplified: Only uses current latestAttestations map (never scans blocks)
   * - Decorates tree with attestedEth based on current latest attestations
   * - Computes GHOST-HEAD
   */
  updateLatestAttestationsAndTree(): void {
    if (!this.blockchain) return;
    
    // Get all attestations from current latest attestations map
    const allAttestations = Array.from(this.latestAttestations.values());
    
    // Use LMD-GHOST to decorate tree and compute GHOST-HEAD
    const tree = this.blockchain.getTree();
    LmdGhost.onAttestationSetChanged(this, tree, allAttestations);
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
      proposerSchedules: Array.from(this.proposerSchedules.entries()).map(([epoch, schedule]) => [
        epoch,
        Array.from(schedule.entries())
      ]),
    };
  }
}

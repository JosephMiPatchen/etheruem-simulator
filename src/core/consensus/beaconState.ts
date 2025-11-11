import { LmdGhost } from '../LmdGhost';

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
  
  // Set of processed attestations (key: "blockHash-validatorAddress")
  // Tracks attestations that have been included in blocks to prevent duplicates
  public processedAttestations: Set<string>;
  
  // LMD-GHOST fork choice handler
  private lmdGhost: LmdGhost;
  
  // Latest attestations from each validator (for LMD GHOST fork choice)
  // Exposed as getter for backward compatibility with UI
  public get latestAttestations(): Map<string, Attestation> {
    return this.lmdGhost.getLatestAttestations();
  }
  
  // Reference to blockchain for triggering tree updates (set after construction)
  private blockchain?: any;
  
  constructor(genesisTime: number, validators: Validator[]) {
    this.genesisTime = genesisTime;
    this.validators = validators;
    this.randaoMixes = new Map();
    this.currentEpochSchedule = new Map();
    this.beaconPool = [];
    this.processedAttestations = new Set();
    this.lmdGhost = new LmdGhost();
    
    // Initialize first RANDAO mix for epoch 0
    this.randaoMixes.set(0, this.generateInitialRandao());
  }
  
  /**
   * Set blockchain reference for triggering tree updates
   * Called by Blockchain after construction
   */
  setBlockchain(blockchain: any): void {
    this.blockchain = blockchain;
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
   * Eagerly updates tree decoration (LMD GHOST fork choice)
   */
  addAttestation(attestation: Attestation): void {
    // Check if this exact attestation already exists (same validator + block hash)
    const exists = this.beaconPool.some(
      att => att.validatorAddress === attestation.validatorAddress && 
             att.blockHash === attestation.blockHash
    );
    
    if (!exists) {
      this.beaconPool.push(attestation);
      
      // Eagerly update tree decoration when new attestation arrives
      // This matches Ethereum's behavior where fork choice updates immediately
      this.updateLatestAttestationsAndTree();
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
    const existing = this.lmdGhost.getLatestAttestations().get(attestation.validatorAddress);
    
    // If no existing attestation or new one is more recent, update
    if (!existing || attestation.timestamp > existing.timestamp) {
      this.lmdGhost.recordAttestation(attestation);
      return true;
    }
    
    return false;
  }
  
  /**
   * Clear all latest attestations (used during chain replacement)
   */
  clearLatestAttestations(): void {
    this.lmdGhost.clearAttestations();
  }
  
  /**
   * Get all attestations from beacon pool + blockchain
   * This is the union set used for computing latest attestations
   */
  getAllAttestations(blockchain: any[]): Attestation[] {
    const allAttestations: Attestation[] = [];
    
    // Add attestations from beacon pool
    allAttestations.push(...this.beaconPool);
    
    // Add attestations from all blocks in blockchain
    for (const block of blockchain) {
      if (block.attestations && block.attestations.length > 0) {
        allAttestations.push(...block.attestations);
      }
    }
    
    return allAttestations;
  }
  
  /**
   * Walk up from a block to null root, updating attestedEth values
   * Used to increment or decrement attestedEth along a path
   */
  private walkTreeAndUpdateAttestedEth(blockHash: string, ethDelta: number): void {
    if (!this.blockchain) return;
    
    const blockTree = this.blockchain.getTree();
    let currentNode = blockTree.getNode(blockHash);
    
    while (currentNode) {
      // Initialize attestedEth if not set
      if (currentNode.metadata.attestedEth === undefined) {
        currentNode.metadata.attestedEth = 0;
      }
      
      // Update attestedEth
      currentNode.metadata.attestedEth += ethDelta;
      
      // Ensure it doesn't go negative (shouldn't happen, but safety check)
      if (currentNode.metadata.attestedEth < 0) {
        currentNode.metadata.attestedEth = 0;
      }
      
      // Move to parent (stops at null root since its parent is null)
      currentNode = currentNode.parent ?? undefined;
    }
  }
  
  /**
   * Clear all attestedEth values in the tree (set to 0)
   * Used during chain replacement before rebuilding
   */
  private clearAllAttestedEth(): void {
    if (!this.blockchain) return;
    
    const blockTree = this.blockchain.getTree();
    const allNodes = blockTree.getAllNodes();
    for (const node of allNodes) {
      node.metadata.attestedEth = 0;
    }
  }
  
  /**
   * Rebuild attestedEth values for entire tree from latest attestations
   * Called after chain replacement or when rebuilding from scratch
   */
  private rebuildAttestedEthFromLatestAttestations(): void {
    if (!this.blockchain) return;
    
    // Use LMD-GHOST to decorate the entire tree
    const blockTree = this.blockchain.getTree();
    this.lmdGhost.decorateTree(blockTree);
  }
  
  /**
   * Update latest attestations and tree decoration
   * This is the main entry point for updating LMD GHOST state
   * Called when new attestations arrive or blocks are added
   */
  updateLatestAttestationsAndTree(): void {
    if (!this.blockchain) return;
    
    // Get all attestations (beacon pool + blockchain)
    const allBlocks = this.blockchain.getTree().getAllBlocks();
    const allAttestations = this.getAllAttestations(allBlocks);
    
    // Update latest attestations for each validator
    for (const attestation of allAttestations) {
      const oldAttestation = this.latestAttestations.get(attestation.validatorAddress);
      const wasUpdated = this.updateLatestAttestation(attestation);
      
      if (wasUpdated) {
        const stake = this.getValidatorStake(attestation.validatorAddress);
        
        // Decrement old attestation path if it existed
        if (oldAttestation) {
          this.walkTreeAndUpdateAttestedEth(oldAttestation.blockHash, -stake);
        }
        
        // Increment new attestation path
        this.walkTreeAndUpdateAttestedEth(attestation.blockHash, stake);
      }
    }
  }
  
  /**
   * Full rebuild of latest attestations and attestedEth
   * Used during chain replacement - clears everything and rebuilds from scratch
   */
  rebuildLatestAttestationsAndTree(): void {
    if (!this.blockchain) return;
    
    // Clear all attestedEth values
    this.clearAllAttestedEth();
    
    // Clear latest attestations
    this.clearLatestAttestations();
    
    // Rebuild from beacon pool + blockchain
    const allBlocks = this.blockchain.getTree().getAllBlocks();
    const allAttestations = this.getAllAttestations(allBlocks);
    
    // Update latest attestations (this will pick the most recent for each validator)
    for (const attestation of allAttestations) {
      this.updateLatestAttestation(attestation);
    }
    
    // Rebuild attestedEth from latest attestations
    this.rebuildAttestedEthFromLatestAttestations();
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

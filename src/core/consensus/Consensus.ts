import { Block } from '../../types/types';
import { SimulatorConfig } from '../../config/config';
import { Node } from '../node';
import { BeaconState } from './beaconState';
import { Blockchain } from '../blockchain/blockchain';
import { BlockCreator } from '../blockchain/blockCreator';
import { RANDAO } from './randao';
import { MessageType } from '../../network/messages';
import { Mempool } from '../mempool/mempool';

/**
 * Consensus class handles PoS consensus logic
 * Runs every slot to determine proposer and handle block proposals
 * 
 * State lives in BeaconState, this class contains logic only
 * Uses BlockCreator for block transaction creation
 */
export class Consensus {
  private beaconState: BeaconState;
  private blockchain: Blockchain;
  private node: Node;
  private nodeId: string;
  private nodeAddress: string;
  private mempool: Mempool;
  private paintingComplete: boolean = false; // Flag to stop creating paint transactions
  
  // Consensus status for UI display
  public consensusStatus: 'idle' | 'validating' | 'proposing' = 'idle';
  
  // Callback for sending messages to network
  private onSendMessage?: (message: any) => void;
  
  constructor(
    beaconState: BeaconState,
    blockchain: Blockchain,
    node: Node,
    mempool: Mempool
  ) {
    this.beaconState = beaconState;
    this.blockchain = blockchain;
    this.node = node;
    this.nodeId = node.getNodeId();
    this.nodeAddress = node.getAddress();
    this.mempool = mempool;
    
    // Proposer schedule will be computed lazily when first slot is processed
    const currentSlot = this.getCurrentSlot();
    const currentEpoch = this.getEpoch(currentSlot);
    console.log(`[Consensus ${this.nodeAddress.slice(0, 8)}] Initializing with slot ${currentSlot}, epoch ${currentEpoch}`);
  }
  
  /**
   * Mark painting as complete - stops creating paint transactions
   */
  public markPaintingComplete(): void {
    this.paintingComplete = true;
    console.log(`${this.node.getNodeId()}: Painting complete - no more paint transactions will be created`);
  }
  
  /**
   * Check if painting is complete
   */
  public isPaintingComplete(): boolean {
    return this.paintingComplete;
  }
  
  /**
   * Sets the callback for sending messages to the network
   */
  setMessageCallback(callback: (message: any) => void): void {
    this.onSendMessage = callback;
  }
  
  /**
   * Helper: Get current slot based on genesis time
   */
  private getCurrentSlot(): number {
    return this.beaconState.getCurrentSlot();
  }
  
  /**
   * Helper: Calculate epoch from slot
   */
  private getEpoch(slot: number): number {
    return Math.floor(slot / SimulatorConfig.SLOTS_PER_EPOCH);
  }
  
  /**
   * Helper: Check if slot is first slot of epoch
   */
  private isFirstSlotOfEpoch(slot: number): boolean {
    return slot % SimulatorConfig.SLOTS_PER_EPOCH === 0;
  }
  
  /**
   * Helper: Get slots per epoch constant
   */
  private getSlotsPerEpoch(): number {
    return SimulatorConfig.SLOTS_PER_EPOCH;
  }
  
  /**
   * Ensures proposer schedule exists for the given epoch
   * Computes schedule if it doesn't exist yet
   * This is the single method for schedule computation, used by both:
   * - Constructor (initialization)
   * - processSlot (first slot of new epoch)
   */
  private ensureScheduleForEpoch(epoch: number): void {
    // Check if schedule already exists for this epoch
    const existingSchedule = this.beaconState.proposerSchedules.get(epoch);
    if (existingSchedule) {
      console.log(`[Consensus ${this.nodeAddress.slice(0, 8)}] Schedule already exists for epoch ${epoch}`);
      return;
    }
    
    // Schedule doesn't exist, compute it
    console.log(`[Consensus ${this.nodeAddress.slice(0, 8)}] Computing new schedule for epoch ${epoch}`);
    this.computeProposerSchedule(epoch);
  }
  
  /**
   * Forces recomputation of proposer schedule for a specific epoch
   * Used to update Epoch 0 schedule after validator addresses are finalized
   * Public method called from NodeWorker during initialization
   */
  public recomputeScheduleForEpoch(epoch: number): void {
    console.log(`[Consensus ${this.nodeAddress.slice(0, 8)}] Recomputing schedule for epoch ${epoch}`);
    this.computeProposerSchedule(epoch);
  }
  
  /**
   * Main consensus logic - called every slot
   * 1. Calculate current slot and epoch
   * 2. Ensure proposer schedule exists for current epoch
   * 3. Determine current proposer for this slot
   * 4. If we are proposer, create and broadcast block
   * 5. If not proposer, wait for block from proposer
   */
  async processSlot(): Promise<void> {
    // 1. Get current slot and epoch (time-based calculation)
    const currentSlot = this.getCurrentSlot();
    const currentEpoch = this.getEpoch(currentSlot);
    
    console.log(`[Consensus ${this.nodeAddress.slice(0, 8)}] Processing slot ${currentSlot}, epoch ${currentEpoch}`);
    
    // 2. Ensure proposer schedule exists for current epoch (lazy calculation)
    this.ensureScheduleForEpoch(currentEpoch);
    
    // 3. Determine current proposer for this slot
    const proposer = this.getCurrentProposer(currentEpoch, currentSlot);
    
    console.log(`[Consensus ${this.nodeAddress.slice(0, 8)}] Proposer for slot ${currentSlot}: ${proposer?.slice(0, 8) || 'null'}`);
    
    // 4. If we are the proposer, create and broadcast block
    if (proposer === this.nodeAddress) {
      console.log(`[Consensus ${this.nodeAddress.slice(0, 8)}] I am the proposer for slot ${currentSlot}!`);
      this.consensusStatus = 'proposing';
      await this.proposeBlock(currentSlot);
    } else {
      // 5. If not proposer, we are validating (waiting for block)
      this.consensusStatus = 'validating';
    }
  }
  
  /**
   * Computes the proposer schedule for an epoch using RANDAO
   * Updates BeaconState.proposerSchedules with epoch -> (slot -> validator address)
   */
  private computeProposerSchedule(epoch: number): void {
    try {
      const slotsPerEpoch = this.getSlotsPerEpoch();
      const firstSlot = epoch * slotsPerEpoch;
      
      console.log(`[Consensus] Computing proposer schedule for epoch ${epoch}, first slot: ${firstSlot}`);
      
      // Get proposer schedule for entire epoch from RANDAO
      // Returns array of 32 validator addresses (one per slot)
      const proposerArray = RANDAO.getProposerSchedule(this.beaconState, epoch);
      
      if (!proposerArray || proposerArray.length === 0) {
        console.error(`[Consensus] RANDAO returned empty proposer array for epoch ${epoch}`);
        return;
      }
      
      console.log(`[Consensus] RANDAO returned ${proposerArray.length} proposers for epoch ${epoch}`);
      
      // Create schedule map: slot -> validator address
      const schedule = new Map<number, string>();
      for (let i = 0; i < slotsPerEpoch; i++) {
        const slot = firstSlot + i;
        schedule.set(slot, proposerArray[i]);
      }
      
      // Store schedule in BeaconState
      this.beaconState.proposerSchedules.set(epoch, schedule);
      
      console.log(`[Consensus] Successfully stored proposer schedule for epoch ${epoch}, schedule size: ${schedule.size}`);
    } catch (error) {
      console.error(`[Consensus] Error computing proposer schedule for epoch ${epoch}:`, error);
    }
  }
  
  /**
   * Gets the current proposer for a slot from the proposer schedule
   */
  private getCurrentProposer(epoch: number, slot: number): string | null {
    const schedule = this.beaconState.proposerSchedules.get(epoch);
    if (!schedule) {
      console.warn(`[Consensus] No proposer schedule for epoch ${epoch}`);
      return null;
    }
    
    return schedule.get(slot) || null;
  }
  
  /**
   * Proposes a new block for the given slot
   * Called when this node is the proposer for the current slot
   * 
   * Creates complete block using BlockCreator and broadcasts to all validators
   */
  private async proposeBlock(slot: number): Promise<void> {
    console.log(`[Consensus] Node ${this.nodeAddress.slice(0, 8)} proposing block for slot ${slot}`);
    
    // Validate: Don't propose if previous block has the same slot
    const latestBlock = this.blockchain.getLatestBlock();
    if (latestBlock && latestBlock.header.slot === slot) {
      console.warn(`[Consensus] Skipping proposal - previous block already has slot ${slot}`);
      return;
    }
    
    // Calculate current epoch and generate RANDAO reveal
    const currentEpoch = this.getEpoch(slot);
    const randaoReveal = RANDAO.calculateRandaoReveal(currentEpoch, this.node);
    console.log(`[Consensus] Generated RANDAO reveal for epoch ${currentEpoch}: ${randaoReveal.slice(0, 16)}...`);
    
    // Create complete block using BlockCreator
    const block = await BlockCreator.createBlock(
      this.node,
      this.blockchain,
      this.mempool,
      slot,
      randaoReveal,
      this.paintingComplete
    );
    
    console.log(`[Consensus] Created block with ${block.transactions.length} transactions for slot ${slot}`);
    console.log(`[Consensus] Transaction types: ${block.transactions.map(tx => {
      if (tx.from === SimulatorConfig.PROTOCOL_NODE_ID) return 'coinbase';
      if (tx.to === '0xEPM_PAINT_CONTRACT') return 'paint';
      return 'peer-payment';
    }).join(', ')}`);
    
    // Process our own block through the same flow as received blocks
    const success = await this.handleProposedBlock(block, slot, this.nodeAddress);
    
    if (!success) {
      console.error(`[Consensus] Failed to validate own proposed block for slot ${slot}`);
      return; // slot would result in being skipped
    }
    
    // Only broadcast if our own validation succeeded
    console.log(`[Consensus] Own block validated successfully, broadcasting to validators`);
    this.broadcastBlockToValidators(block, slot);
  }
  
  /**
   * Broadcasts a proposed block to all validators
   * Uses validator addresses from BeaconState, not peer list
   */
  private broadcastBlockToValidators(block: Block, slot: number): void {
    if (!this.onSendMessage) return;
    
    const message = {
      type: MessageType.PROPOSER_BLOCK_BROADCAST,
      fromNodeId: this.nodeId,
      block,
      slot
    };
    
    this.onSendMessage(message);
    console.log(`[Consensus] Broadcast block for slot ${slot} to validators`);
  }
  
  /**
   * Handles receiving a proposed block from another validator
   * 1. Validate the block
   * 2. If valid, add to blockchain
   * 3. Create and broadcast attestation
   * 4. Update own beacon pool (triggers LMD-GHOST update)
   * @returns true if block was successfully processed, false otherwise
   */
  async handleProposedBlock(block: Block, slot: number, fromAddress: string): Promise<boolean> {
    console.log(`[Consensus] Received proposed block for slot ${slot} from ${fromAddress.slice(0, 8)}`);
    
    // 1. Get current GHOST-HEAD before adding block
    const oldGhostHead = this.blockchain.getTree().getGhostHead();
    
    // 2. Add block to blockchain (handles validation, state updates, and tree management)
    const added = await this.blockchain.addBlock(block);
    if (!added) {
      console.warn(`[Consensus] Failed to add block for slot ${slot} - validation failed or parent not found`);
      return false;
    }
    
    // 3. Get new GHOST-HEAD after adding block
    const newGhostHead = this.blockchain.getTree().getGhostHead();
    
    // 4. Only attest if new GHOST-HEAD points to the block we just added
    if (newGhostHead?.hash === block.hash) {
      console.log(`[Consensus] New GHOST-HEAD is our block ${block.hash!.slice(0, 8)} - creating attestation`);
      
      const attestation = {
        validatorAddress: this.nodeAddress,
        blockHash: block.hash!,
        timestamp: Date.now()
      };
      
      // Update own beacon pool (triggers LMD-GHOST update)
      this.beaconState.addAttestation(attestation);
      
      // Broadcast attestation to peers
      this.broadcastAttestation(attestation);
      
      console.log(`[Consensus] Attested to block ${block.hash!.slice(0, 8)} for slot ${slot}`);
      return true;
    } else {
      // Block was added but didn't become GHOST-HEAD (on a fork or behind)
      console.log(`[Consensus] Block ${block.hash!.slice(0, 8)} added but not GHOST-HEAD (old: ${oldGhostHead?.hash.slice(0, 8)}, new: ${newGhostHead?.hash.slice(0, 8)}) - not attesting`);
      return true; // Still successful, just not attesting
    }
  }
  
  /**
   * Broadcasts an attestation to peers
   */
  private broadcastAttestation(attestation: any): void {
    if (!this.onSendMessage) return;
    
    console.log(`[Consensus ${this.nodeAddress.slice(0, 8)}] 📤 Broadcasting attestation for block ${attestation.blockHash.slice(0, 8)}`);
    
    const message = {
      type: MessageType.ATTESTATION,
      fromNodeId: this.nodeId,
      attestation
    };
    
    this.onSendMessage(message);
  }
}

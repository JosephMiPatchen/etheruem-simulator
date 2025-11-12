import { Block, EthereumTransaction } from '../../types/types';
import { SimulatorConfig } from '../../config/config';
import { calculateBlockHeaderHash, calculateTransactionHash, validateBlock } from '../validation/blockValidator';
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
  private nodeAddress: string;
  private mempool: Mempool;
  private paintingComplete: boolean = false; // Flag to stop creating paint transactions
  
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
    this.nodeAddress = node.getAddress();
    this.mempool = mempool;
    
    // Initialize proposer schedule for the current epoch
    // This ensures the schedule is ready when the first slot timer fires
    const currentSlot = this.getCurrentSlot();
    const currentEpoch = this.getEpoch(currentSlot);
    console.log(`[Consensus ${this.nodeAddress.slice(0, 8)}] Initializing with slot ${currentSlot}, epoch ${currentEpoch}`);
    this.ensureScheduleForEpoch(currentEpoch);
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
   * Main consensus logic - called every slot
   * 1. Calculate current slot and epoch
   * 2. Ensure proposer schedule exists for current epoch
   * 3. Determine current proposer for this slot
   * 4. If we are proposer, create and broadcast block
   * 5. If not proposer, wait for block from proposer
   */
  async processSlot(): Promise<void> {
    // 1. Calculate current slot and epoch
    const currentSlot = this.getCurrentSlot();
    const currentEpoch = this.getEpoch(currentSlot);
    
    console.log(`[Consensus ${this.nodeAddress.slice(0, 8)}] Processing slot ${currentSlot}, epoch ${currentEpoch}`);
    
    // 2. Ensure proposer schedule exists for current epoch
    this.ensureScheduleForEpoch(currentEpoch);
    
    // 3. Determine current proposer for this slot
    const proposer = this.getCurrentProposer(currentEpoch, currentSlot);
    this.beaconState.currentProposer = proposer;
    
    console.log(`[Consensus ${this.nodeAddress.slice(0, 8)}] Proposer for slot ${currentSlot}: ${proposer?.slice(0, 8) || 'null'}`);
    
    // 4. If we are the proposer, create and broadcast block
    if (proposer === this.nodeAddress) {
      console.log(`[Consensus ${this.nodeAddress.slice(0, 8)}] I am the proposer for slot ${currentSlot}!`);
      await this.proposeBlock(currentSlot);
    }
    // 5. If not proposer, do nothing (wait for block from proposer)
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
   * Proposes a block for the current slot
   * Creates block with coinbase, mempool txs, peer payments, paint tx
   * Sets slot number and nonce 0x0 (no PoW mining)
   * Broadcasts to all validators
   * Uses BlockCreator for transaction creation
   */
  private async proposeBlock(slot: number): Promise<void> {
    console.log(`[Consensus] Node ${this.nodeAddress.slice(0, 8)} proposing block for slot ${slot}`);
    
    // Get the latest block to build on top of
    const latestBlock = this.blockchain.getLatestBlock();
    if (!latestBlock) {
      console.error('[Consensus] Cannot propose block: no latest block');
      return;
    }
    
    // Create all transactions for the block using BlockCreator
    const transactions = await BlockCreator.createBlockTransactions(
      this.node,
      this.blockchain,
      this.mempool,
      latestBlock.header.height + 1,
      this.paintingComplete
    );
    
    // Create block header with slot and nonce 0x0 (no PoW)
    const header = {
      transactionHash: calculateTransactionHash(transactions),
      timestamp: Date.now(),
      previousHeaderHash: latestBlock.hash || '',
      ceiling: 0, // No ceiling for PoS
      nonce: 0, // 0x0 for PoS (no mining)
      height: latestBlock.header.height + 1,
      slot: slot
    };
    
    // Create block
    const block: Block = {
      header,
      transactions,
      attestations: []
    };
    
    // Compute block hash (includes slot in hash)
    block.hash = calculateBlockHeaderHash(header);
    
    // Add block to our own blockchain
    const added = await this.blockchain.addBlock(block);
    if (!added) {
      console.error('[Consensus] Failed to add proposed block to own chain');
      return;
    }
    
    // Broadcast block to all validators (not all peers)
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
      fromNodeId: this.nodeAddress,
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
   */
  async handleProposedBlock(block: Block, slot: number, fromAddress: string): Promise<void> {
    console.log(`[Consensus] Received proposed block for slot ${slot} from ${fromAddress.slice(0, 8)}`);
    
    // 1. Validate the block
    const latestBlock = this.blockchain.getLatestBlock();
    const previousHash = latestBlock?.hash || '';
    const worldState = this.blockchain.getWorldStateObject();
    const isValid = await validateBlock(block, worldState, previousHash);
    if (!isValid) {
      console.warn(`[Consensus] Invalid block received for slot ${slot}`);
      return;
    }
    
    // 2. Add to blockchain
    const added = await this.blockchain.addBlock(block);
    if (!added) {
      console.warn(`[Consensus] Failed to add received block for slot ${slot}`);
      return;
    }
    
    // 3. Create attestation for this block
    if (!block.hash) {
      console.error('[Consensus] Cannot attest to block without hash');
      return;
    }
    
    const attestation = {
      validatorAddress: this.nodeAddress,
      blockHash: block.hash,
      timestamp: Date.now()
    };
    
    // 4. Update own beacon pool FIRST (triggers LMD-GHOST update)
    this.beaconState.addAttestation(attestation);
    
    // 5. Broadcast attestation to peers
    this.broadcastAttestation(attestation);
    
    console.log(`[Consensus] Attested to block ${block.hash.slice(0, 8)} for slot ${slot}`);
  }
  
  /**
   * Broadcasts an attestation to peers
   */
  private broadcastAttestation(attestation: any): void {
    if (!this.onSendMessage) return;
    
    const message = {
      type: MessageType.ATTESTATION,
      fromNodeId: this.nodeAddress,
      attestation
    };
    
    this.onSendMessage(message);
  }
}

import { Block, EthereumTransaction } from '../../types/types';
import { BeaconState, Validator } from './beaconState';
import { Blockchain } from '../blockchain/blockchain';
import { Randao } from './Randao';
import { MessageType } from '../../network/messages';
import { Mempool } from '../mempool/mempool';

/**
 * Consensus class handles PoS consensus logic
 * Runs every slot to determine proposer and handle block proposals
 * 
 * State lives in BeaconState, this class contains logic only
 */
export class Consensus {
  private beaconState: BeaconState;
  private blockchain: Blockchain;
  private randao: Randao;
  private nodeAddress: string;
  private mempool: Mempool;
  
  // Callback for sending messages to network
  private onSendMessage?: (message: any) => void;
  
  // Callback for creating transactions (painting, distributions)
  private onCreateTransactions?: () => EthereumTransaction[];
  
  constructor(
    beaconState: BeaconState,
    blockchain: Blockchain,
    nodeAddress: string,
    mempool: Mempool
  ) {
    this.beaconState = beaconState;
    this.blockchain = blockchain;
    this.nodeAddress = nodeAddress;
    this.mempool = mempool;
    this.randao = new Randao(beaconState);
  }
  
  /**
   * Sets the callback for sending messages to the network
   */
  setMessageCallback(callback: (message: any) => void): void {
    this.onSendMessage = callback;
  }
  
  /**
   * Sets the callback for creating transactions (painting, distributions)
   */
  setTransactionCallback(callback: () => EthereumTransaction[]): void {
    this.onCreateTransactions = callback;
  }
  
  /**
   * Main consensus logic - called every slot
   * 1. Calculate current slot and epoch
   * 2. If first slot of epoch, compute proposer schedule
   * 3. Determine current proposer for this slot
   * 4. If we are proposer, create and broadcast block
   * 5. If not proposer, wait for block from proposer
   */
  async processSlot(): Promise<void> {
    // 1. Calculate current slot and epoch
    const currentSlot = this.beaconState.getCurrentSlot();
    const currentEpoch = this.beaconState.getEpoch(currentSlot);
    
    // 2. If first slot of epoch, compute proposer schedule
    if (this.beaconState.isFirstSlotOfEpoch(currentSlot)) {
      this.computeProposerSchedule(currentEpoch);
    }
    
    // 3. Determine current proposer for this slot
    const proposer = this.getCurrentProposer(currentEpoch, currentSlot);
    this.beaconState.currentProposer = proposer;
    
    // 4. If we are the proposer, create and broadcast block
    if (proposer === this.nodeAddress) {
      await this.proposeBlock(currentSlot);
    }
    // 5. If not proposer, do nothing (wait for block from proposer)
  }
  
  /**
   * Computes the proposer schedule for an epoch using RANDAO
   * Updates BeaconState.proposerSchedules with epoch -> (slot -> validator address)
   */
  private computeProposerSchedule(epoch: number): void {
    const slotsPerEpoch = this.beaconState.getSlotsPerEpoch();
    const firstSlot = epoch * slotsPerEpoch;
    
    // Create schedule for this epoch
    const schedule = new Map<number, string>();
    
    // For each slot in the epoch, assign a proposer using RANDAO
    for (let i = 0; i < slotsPerEpoch; i++) {
      const slot = firstSlot + i;
      const proposer = this.randao.selectProposer(epoch, slot);
      schedule.set(slot, proposer);
    }
    
    // Store schedule in BeaconState
    this.beaconState.proposerSchedules.set(epoch, schedule);
    
    console.log(`[Consensus] Computed proposer schedule for epoch ${epoch}`);
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
   * Creates block with transactions, slot number, nonce 0x0
   * Broadcasts to all validators
   */
  private async proposeBlock(slot: number): Promise<void> {
    console.log(`[Consensus] Node ${this.nodeAddress.slice(0, 8)} proposing block for slot ${slot}`);
    
    // Get transactions from mempool
    const pendingTransactions = this.mempool.getTransactions(10); // Max 10 transactions
    
    // Add painting and distribution transactions if callback is set
    let transactions: EthereumTransaction[] = [...pendingTransactions];
    if (this.onCreateTransactions) {
      const additionalTxs = this.onCreateTransactions();
      transactions = [...transactions, ...additionalTxs];
    }
    
    // Get the latest block to build on top of
    const latestBlock = this.blockchain.getLatestBlock();
    if (!latestBlock) {
      console.error('[Consensus] Cannot propose block: no latest block');
      return;
    }
    
    // Create block header with slot and nonce 0x0 (no PoW)
    const header = {
      transactionHash: this.blockchain.hashTransactions(transactions),
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
    block.hash = this.blockchain.hashBlockHeader(header);
    
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
    const isValid = await this.blockchain.validateBlock(block);
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

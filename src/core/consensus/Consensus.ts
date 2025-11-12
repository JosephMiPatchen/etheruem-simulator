import { Block, EthereumTransaction, PeerInfoMap } from '../../types/types';
import { BeaconState } from './beaconState';
import { Blockchain } from '../blockchain/blockchain';
import { RANDAO } from './randao';
import { MessageType } from '../../network/messages';
import { Mempool } from '../mempool/mempool';
import { calculateBlockHeaderHash, calculateTransactionHash, validateBlock } from '../validation/blockValidator';
import { Node } from '../node';

/**
 * Consensus class handles PoS consensus logic
 * Runs every slot to determine proposer and handle block proposals
 * 
 * State lives in BeaconState, this class contains logic only
 */
export class Consensus {
  private beaconState: BeaconState;
  private blockchain: Blockchain;
  private node: Node;
  private nodeAddress: string;
  private mempool: Mempool;
  
  // Constants
  private readonly SECONDS_PER_SLOT = 12;
  private readonly SLOTS_PER_EPOCH = 32;
  
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
    return Math.floor(slot / this.SLOTS_PER_EPOCH);
  }
  
  /**
   * Helper: Check if slot is first slot of epoch
   */
  private isFirstSlotOfEpoch(slot: number): boolean {
    return slot % this.SLOTS_PER_EPOCH === 0;
  }
  
  /**
   * Helper: Get slots per epoch constant
   */
  private getSlotsPerEpoch(): number {
    return this.SLOTS_PER_EPOCH;
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
    const currentSlot = this.getCurrentSlot();
    const currentEpoch = this.getEpoch(currentSlot);
    
    // 2. If first slot of epoch, compute proposer schedule
    if (this.isFirstSlotOfEpoch(currentSlot)) {
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
    const slotsPerEpoch = this.getSlotsPerEpoch();
    const firstSlot = epoch * slotsPerEpoch;
    
    // Get proposer schedule for entire epoch from RANDAO
    // Returns array of 32 validator addresses (one per slot)
    const proposerArray = RANDAO.getProposerSchedule(this.beaconState, epoch);
    
    // Create schedule map: slot -> validator address
    const schedule = new Map<number, string>();
    for (let i = 0; i < slotsPerEpoch; i++) {
      const slot = firstSlot + i;
      schedule.set(slot, proposerArray[i]);
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
   * Gets peers with valid addresses
   * @returns PeerInfoMap containing only peers with valid addresses
   */
  private getValidPeers(): PeerInfoMap {
    const peers = this.node.getPeerInfos();
    return Object.entries(peers).reduce((validPeers, [peerId, info]) => {
      // Only include peers that have a defined non-empty address
      if (info?.address !== undefined && info.address !== '') {
        validPeers[peerId] = { 
          address: info.address
        };
      }
      return validPeers;
    }, {} as PeerInfoMap);
  }
  
  /**
   * Creates transactions for a new block
   * Includes: coinbase, mempool transactions, peer payments, and paint transaction
   * @param height Block height
   * @returns Promise resolving to array of transactions for the block
   */
  private async createBlockTransactions(height: number): Promise<EthereumTransaction[]> {
    const { createCoinbaseTransaction, createPeerPaymentTransactions } = await import('../blockchain/transaction');
    
    // Create coinbase transaction (proposer receives block reward)
    const coinbaseTransaction = createCoinbaseTransaction(this.nodeAddress);
    
    const transactions: EthereumTransaction[] = [coinbaseTransaction];
    
    // Get peers with valid addresses
    const validPeers = this.getValidPeers();
    
    if (Object.keys(validPeers).length === 0) {
      console.warn('[Consensus] No peers with valid addresses available for peer payments');
      return transactions;
    }
    
    // Get proposer's current nonce from world state
    // Coinbase transactions don't increment nonce, so we use the proposer's current nonce
    const worldState = this.blockchain.getWorldState();
    const proposerAccount = worldState[this.nodeAddress];
    const baseNonce = proposerAccount ? proposerAccount.nonce : 0;
    
    // IMPORTANT: Add mempool transactions FIRST
    // This ensures peer payments and paint transactions use nonces that come after mempool transactions
    const { MAX_BLOCK_TRANSACTIONS } = await import('../../config/config').then(m => m.SimulatorConfig);
    const maxMempoolSlots = MAX_BLOCK_TRANSACTIONS - 1 - Object.keys(validPeers).length; // Reserve slots for coinbase, peer payments, and paint tx
    const mempoolTransactions = this.mempool.getTransactions(Math.max(0, maxMempoolSlots));
    transactions.push(...mempoolTransactions);
    
    // Calculate starting nonce for peer payments (after mempool transactions)
    const peerPaymentStartNonce = baseNonce + mempoolTransactions.length;
    
    // Create peer payment transactions (one per peer)
    const peerPayments = await createPeerPaymentTransactions(
      this.nodeAddress,
      peerPaymentStartNonce,
      this.node.getPrivateKey(),
      this.node.getPublicKey(),
      validPeers
    );
    
    // Add all peer payment transactions to the block
    transactions.push(...peerPayments);
    
    // After peer payments, create a paint transaction with remaining ETH (truncated to integer)
    const paintNonce = peerPaymentStartNonce + peerPayments.length;
    const paintTransaction = await this.createPaintTransaction(paintNonce);
    if (paintTransaction) {
      transactions.push(paintTransaction);
    }
    
    return transactions;
  }
  
  /**
   * Creates a paint transaction to send remaining ETH (truncated to integer) to EPM contract
   * @param nonce The nonce to use for this transaction
   * @returns Paint transaction or null if insufficient balance
   */
  private async createPaintTransaction(nonce: number): Promise<EthereumTransaction | null> {
    const { SimulatorConfig } = await import('../../config/config');
    const { sha256 } = await import('@noble/hashes/sha256');
    const { bytesToHex } = await import('@noble/hashes/utils');
    const { generateSignature } = await import('../../utils/cryptoUtils');
    const { createSignatureInput } = await import('../blockchain/transaction');
    const { getNodePaintColor } = await import('../../utils/nodeColorUtils');
    
    // Get proposer's current account state
    const worldState = this.blockchain.getWorldState();
    const proposerAccount = worldState[this.nodeAddress];
    
    if (!proposerAccount) return null;
    
    // Calculate how much ETH will be spent on peer payments
    const validPeers = this.getValidPeers();
    const peerCount = Object.keys(validPeers).length;
    const redistributionAmount = SimulatorConfig.BLOCK_REWARD * SimulatorConfig.REDISTRIBUTION_RATIO;
    const totalPeerPayments = peerCount > 0 ? redistributionAmount : 0;
    
    // Calculate remaining balance after peer payments
    const balanceAfterPeerPayments = proposerAccount.balance - totalPeerPayments;
    
    // Calculate ETH to send (truncate to integer)
    const ethToSend = Math.floor(balanceAfterPeerPayments);
    
    // Only send if we have at least 1 ETH after peer payments
    if (ethToSend < 1) return null;
    
    const timestamp = Date.now();
    
    // Calculate txid (hash of transaction data)
    // NOTE: Must match validator's calculateTxid - does NOT include data field
    const txString = JSON.stringify({ 
      from: this.nodeAddress, 
      to: '0xEPM_PAINT_CONTRACT', 
      value: ethToSend, 
      nonce, 
      timestamp
    });
    const txid = bytesToHex(sha256(new TextEncoder().encode(txString)));
    
    // Create signature input (just the txid)
    const signatureInput = createSignatureInput({ txid });
    
    // Generate signature
    let signature;
    try {
      signature = await generateSignature(signatureInput, this.node.getPrivateKey());
    } catch (error) {
      console.error('[Consensus] Error generating signature for paint transaction:', error);
      signature = `error-${timestamp}`;
    }
    
    // Choose a deterministic color for this node based on its ID
    // This ensures each node consistently paints the same color
    const nodeId = this.node.getNodeId();
    const nodeColor = getNodePaintColor(nodeId);
    
    // Build complete paint transaction with color data
    return {
      from: this.nodeAddress,
      to: '0xEPM_PAINT_CONTRACT',
      value: ethToSend,
      nonce,
      data: JSON.stringify({ color: nodeColor }),
      publicKey: this.node.getPublicKey(),
      signature,
      timestamp,
      txid
    };
  }
  
  /**
   * Proposes a block for the current slot
   * Creates block with coinbase, mempool txs, peer payments, paint tx
   * Sets slot number and nonce 0x0 (no PoW mining)
   * Broadcasts to all validators
   */
  private async proposeBlock(slot: number): Promise<void> {
    console.log(`[Consensus] Node ${this.nodeAddress.slice(0, 8)} proposing block for slot ${slot}`);
    
    // Get the latest block to build on top of
    const latestBlock = this.blockchain.getLatestBlock();
    if (!latestBlock) {
      console.error('[Consensus] Cannot propose block: no latest block');
      return;
    }
    
    // Create all transactions for the block (coinbase, mempool, peer payments, paint)
    const transactions = await this.createBlockTransactions(latestBlock.header.height + 1);
    
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

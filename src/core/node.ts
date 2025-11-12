import { Block, NodeState, PeerInfoMap, Account, EthereumTransaction } from '../types/types';
import { Blockchain } from './blockchain/blockchain';
import { Miner } from './mining/miner';
import { Mempool } from './mempool/mempool';
import { BeaconState, Validator } from './consensus/beaconState';
import { Sync } from './consensus/Sync';
import { Consensus } from './consensus/Consensus';
import { generatePrivateKey, derivePublicKey, generateAddress } from '../utils/cryptoUtils';

/**
 * Node class representing a full node in the Bitcoin network
 * Integrates blockchain and mining functionality
 */
export class Node {
  private nodeId: string;
  private blockchain: Blockchain;
  private miner: Miner;
  private mempool: Mempool;
  private beaconState: BeaconState; // Consensus Layer state
  private sync: Sync; // PoS synchronization
  private consensus: Consensus; // PoS consensus and block proposal
  private peers: PeerInfoMap = {};
  
  // Security-related properties
  private privateKey: string;
  private publicKey: string;
  private address: string;
  
  // Callbacks for network events
  private onBlockBroadcast?: (block: Block) => void;
  private onChainUpdated?: () => void;
  
  constructor(nodeId: string, genesisTime?: number, validators?: Validator[]) {
    this.nodeId = nodeId;
    
    // Generate cryptographic keys and their derivatives for this node
    this.privateKey = generatePrivateKey(nodeId);
    this.publicKey = derivePublicKey(this.privateKey);
    this.address = generateAddress(this.publicKey);
    
    // Pass the node's actual address to the blockchain
    this.blockchain = new Blockchain(nodeId, this.address);
    
    // Initialize mempool for pending transactions
    this.mempool = new Mempool();
    
    // Initialize Beacon State (Consensus Layer)
    // All nodes will be initialized with the same genesis time and validator set
    const defaultGenesisTime = genesisTime || Math.floor(Date.now() / 1000);
    const defaultValidators = validators || [];
    this.beaconState = new BeaconState(defaultGenesisTime, defaultValidators);
    
    // Set BeaconState reference on Blockchain so it can rebuild processed attestations when HEAD changes
    this.blockchain.setBeaconState(this.beaconState);
    
    // Initialize Sync for LMD-GHOST head synchronization
    this.sync = new Sync(this.blockchain, this.beaconState, this.nodeId);
    
    // Initialize Consensus for PoS block proposal and validation
    this.consensus = new Consensus(this.beaconState, this.blockchain, this, this.mempool);
    
    // Initialize miner with callback for when a block is mined
    // Using .bind(this) ensures the handleMinedBlock method maintains the Node instance context
    // when called by the Miner. Without binding, 'this' would be undefined or refer to the wrong object
    // when the callback is executed, causing errors when accessing Node properties or methods.
    this.miner = new Miner(
      this.handleMinedBlock.bind(this),
      this
    );
  }
  
  /**
   * Sets the peer information with addresses directly
   * @param peers Object mapping peer IDs to their information including addresses
   */
  setPeerInfosWithAddresses(peers: PeerInfoMap): void {
    // Set the peer information directly
    this.peers = { ...peers };
  }
  
  /**
   * Sets the callback for when a block is broadcast
   */
  setOnBlockBroadcast(callback: (block: Block) => void): void {
    this.onBlockBroadcast = callback;
  }
  
  /**
   * Sets the callback for when the chain is updated
   */
  setOnChainUpdated(callback: () => void): void {
    this.onChainUpdated = callback;
  }
  
  /**
   * Gets the current state of the node
   */
  getState(): NodeState {
    return {
      nodeId: this.nodeId,
      blockchain: this.blockchain.getBlocks(),
      blockchainTree: this.blockchain.getTree(),
      beaconState: this.beaconState,
      worldState: this.blockchain.getWorldState(),
      receipts: this.blockchain.getReceipts(),
      mempool: this.mempool.getAllTransactions(),
      isMining: this.miner.getIsMining(),
      consensusStatus: this.consensus.consensusStatus,
      peerIds: Object.keys(this.peers),
      publicKey: this.publicKey,
      address: this.address
    };
  }
  
  /**
   * Gets transactions from the mempool
   * @param maxCount Maximum number of transactions to return
   * @returns Array of transactions from mempool
   */
  getMempoolTransactions(maxCount: number): EthereumTransaction[] {
    return this.mempool.getTransactions(maxCount);
  }
  
  /**
   * Adds a transaction to this node's mempool
   * @param transaction Transaction to add
   * @returns true if added successfully
   */
  addTransactionToMempool(transaction: EthereumTransaction): boolean {
    return this.mempool.addTransaction(transaction);
  }
  
  /**
   * Handles a block received from the network
   */
  async receiveBlock(block: Block): Promise<void> {
    // Special case for genesis blocks - if we receive one, treat it as a chain
    if (block.header.height === 0) {
      this.receiveChain([block]);
      return;
    }

    // For non-genesis blocks, validate and add to the chain
    const added = await this.blockchain.addBlock(block);
    
    if (added === true) {
      // Remove transactions from mempool that were included in this block
      const txids = block.transactions.map(tx => tx.txid);
      this.mempool.removeTransactions(txids);
      
      // Note: Attestation processing and beacon pool cleanup now handled in blockchain.applyBlockToState()
      
      // Notify that the chain was updated
      if (this.onChainUpdated) {
        this.onChainUpdated();
      }
    } else {
      console.error(`Node ${this.nodeId}: Rejected invalid block at claimed height ${block.header.height}`);
    }
  }
  
  /**
   * Handles a chain received from the network
   */
  async receiveChain(blocks: Block[]): Promise<void> {
    // Try to replace our chain with the received one
    const replaced = await this.blockchain.replaceChain(blocks);
    
    if (replaced === true) {
      // Remove all transactions from mempool that are now in the new chain
      const allTxids = blocks.flatMap(block => block.transactions.map(tx => tx.txid));
      this.mempool.removeTransactions(allTxids);
      
      // Note: processedAttestations is automatically rebuilt by blockchain.replaceChain()
      
      // Notify that the chain was updated
      if (this.onChainUpdated) {
        this.onChainUpdated();
      }
    } else {
      console.error(`Node ${this.nodeId}: Rejected chain of length ${blocks.length} (invalid or not longer than current chain)`);
    }
  }
  
  /**
   * Handles a block that was mined by this node
   */
  private async handleMinedBlock(block: Block): Promise<void> {
    // Add the block to our chain
    const added = await this.blockchain.addBlock(block);
    
    if (added === true) {
      // Check if painting is complete based on transaction receipts
      this.checkPaintingComplete(block);
      
      // Broadcast the block to peers
      if (this.onBlockBroadcast) {
        this.onBlockBroadcast(block);
      }
      
      // Notify that the chain was updated
      if (this.onChainUpdated) {
        this.onChainUpdated();
      }
    } else {
      console.error(`Node ${this.nodeId}: Failed to add self-mined block to chain - this should never happen!`);
    }
  }
  
  /**
   * Check if any paint transactions were rejected and mark painting as complete
   * Only checks if painting hasn't already been marked complete
   */
  private checkPaintingComplete(block: Block): void {
    if (!block.hash || this.miner.isPaintingComplete()) {
      return;
    }
    
    const receipts = this.blockchain.getReceipts();
    const blockReceipts = receipts[block.hash];
    
    if (!blockReceipts) {
      return;
    }
    
    for (const txid in blockReceipts) {
      const receipt = blockReceipts[txid];
      // If this node's paint transaction was rejected, stop creating more
      if (receipt.to === '0xEPM_PAINT_CONTRACT' && 
          receipt.from === this.address &&
          receipt.status === 0) {
        this.miner.markPaintingComplete();
        break;
      }
    }
  }
  
  /**
   * Gets the current blockchain height
   */
  getBlockchainHeight(): number {
    return this.blockchain.getHeight();
  }
  
  /**
   * Gets all blocks in the blockchain
   */
  getBlocks(): Block[] {
    return this.blockchain.getBlocks();
  }
  
  /**
   * Gets the node's public key
   */
  getPublicKey(): string {
    return this.publicKey;
  }
  
  /**
   * Gets the node's Bitcoin address
   */
  getAddress(): string {
    return this.address;
  }
  
  /**
   * Gets the node's private key
   * Note: In a real system, this would be kept private and never exposed
   * It's only exposed here for the simulator's simplified implementation
   * so the miner class can easily access it
   */
  getPrivateKey(): string {
    return this.privateKey;
  }
  
  /**
   * Gets the node ID
   */
  getNodeId(): string {
    return this.nodeId;
  }
  
  /**
   * Gets the peer information map
   */
  getPeerInfos(): PeerInfoMap {
    return this.peers;
  }
  
  /**
   * Gets the Beacon State (Consensus Layer state)
   */
  getBeaconState(): BeaconState {
    return this.beaconState;
  }
  
  /**
   * Gets the Sync instance for LMD-GHOST head synchronization
   */
  getSync(): Sync {
    return this.sync;
  }
  
  /**
   * Gets the Consensus instance for PoS block proposal
   */
  getConsensus(): Consensus {
    return this.consensus;
  }
  
  /**
   * Gets the current world state from the blockchain
   */
  getWorldState(): Record<string, Account> {
    return this.blockchain.getWorldState();
  }
}

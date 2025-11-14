import { Block, NodeState, PeerInfoMap, Account, EthereumTransaction } from '../types/types';
import { Blockchain } from './blockchain/blockchain';
import { Mempool } from './mempool/mempool';
import { BeaconState, Validator } from './consensus/beaconState';
import { Sync } from './consensus/sync';
import { Consensus } from './consensus/Consensus';
import { generatePrivateKey, derivePublicKey, generateAddress } from '../utils/cryptoUtils';

/**
 * Node class representing a full node in the Bitcoin network
 * Integrates blockchain and mining functionality
 */
export class Node {
  private nodeId: string;
  private blockchain: Blockchain;
  private mempool: Mempool;
  private beaconState: BeaconState; // Consensus Layer state
  private sync: Sync; // PoS synchronization
  private consensus: Consensus; // PoS consensus and block proposal
  private peers: PeerInfoMap = {};
  
  // Security-related properties
  private privateKey: string;
  private publicKey: string;
  private address: string;
  
  // Painting state (for EPM contract)
  private paintingComplete: boolean = false;
  
  // Network delay multiplier (1.0 = normal, higher = slower network for this node)
  private networkDelayMultiplier: number = 1.0;
  
  // Callbacks for network events (PoS uses Consensus for block broadcasting)
  private onChainUpdated?: () => void;
  
  constructor(nodeId: string, genesisTime?: number, validators?: Validator[]) {
    this.nodeId = nodeId;
    
    // Generate cryptographic keys and their derivatives for this node
    this.privateKey = generatePrivateKey(nodeId);
    this.publicKey = derivePublicKey(this.privateKey);
    this.address = generateAddress(this.publicKey);
    
    // Initialize Beacon State (Consensus Layer) BEFORE Blockchain
    // All nodes will be initialized with the same genesis time and validator set
    const defaultGenesisTime = genesisTime || Math.floor(Date.now() / 1000);
    const defaultValidators = validators || [];
    this.beaconState = new BeaconState(defaultGenesisTime, defaultValidators);
    
    // Create blockchain with BeaconState so genesis block can be processed correctly
    this.blockchain = new Blockchain(nodeId, this.address, this.beaconState);
    
    // Initialize mempool for pending transactions
    this.mempool = new Mempool();
    
    // Initialize Sync for LMD-GHOST head synchronization
    this.sync = new Sync(this.blockchain, this.nodeId);
    
    // Initialize Consensus for PoS block proposal and validation
    this.consensus = new Consensus(this.beaconState, this.blockchain, this, this.mempool);
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
   * Check if painting is complete for this node
   */
  public isPaintingComplete(): boolean {
    return this.paintingComplete;
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
  
  /**
   * Gets the network delay multiplier for this node
   */
  getNetworkDelayMultiplier(): number {
    return this.networkDelayMultiplier;
  }
  
  /**
   * Sets the network delay multiplier for this node
   * @param multiplier - Multiplier for network delays (1.0 = normal, higher = slower)
   */
  setNetworkDelayMultiplier(multiplier: number): void {
    this.networkDelayMultiplier = Math.max(0.1, multiplier); // Minimum 0.1x
  }
}

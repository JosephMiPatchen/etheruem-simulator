import { Block, NodeState, PeerInfoMap } from '../types/types';
import { Blockchain } from './blockchain/blockchain';
import { Miner } from './mining/miner';
import { generatePrivateKey, derivePublicKey, generateAddress } from '../utils/cryptoUtils';

/**
 * Node class representing a full node in the Bitcoin network
 * Integrates blockchain and mining functionality
 */
export class Node {
  private nodeId: string;
  private blockchain: Blockchain;
  private miner: Miner;
  private peers: PeerInfoMap = {};
  private shouldBeMining: boolean = false;
  
  // Security-related properties
  private privateKey: string;
  private publicKey: string;
  private address: string;
  
  // Callbacks for network events
  private onBlockBroadcast?: (block: Block) => void;
  private onChainUpdated?: () => void;
  
  constructor(nodeId: string) {
    this.nodeId = nodeId;
    
    // Generate cryptographic keys and their derivatives for this node
    this.privateKey = generatePrivateKey(nodeId);
    this.publicKey = derivePublicKey(this.privateKey);
    this.address = generateAddress(this.publicKey);
    
    // Pass the node's actual address to the blockchain
    this.blockchain = new Blockchain(nodeId, this.address);
    
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
      utxo: this.blockchain.getUTXOSet(),
      isMining: this.miner.getIsMining(),
      peerIds: Object.keys(this.peers),
      publicKey: this.publicKey,
      address: this.address
    };
  }
  
  /**
   * Starts mining a new block
   */
  async startMining(): Promise<void> {
    this.shouldBeMining = true;
    const latestBlock = this.blockchain.getLatestBlock();
    await this.miner.startMining(latestBlock);
  }
  
  /**
   * Stops mining
   */
  stopMining(): void {
    this.shouldBeMining = false;
    this.miner.stopMining();
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
      // Stop mining the current block
      this.miner.stopMining();
      
      // Only start mining if we should be mining
      if (this.shouldBeMining) {
        this.startMining();
      }
      
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
      // Stop current mining operation if we were mining
      const wasMining = this.miner.isMining;
      this.miner.stopMining();
      
      // Only restart mining if we were mining before
      if (wasMining) {
        this.startMining();
      }
      
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
      // Broadcast the block to peers
      if (this.onBlockBroadcast) {
        this.onBlockBroadcast(block);
      }
      
      // Start mining a new block
      this.startMining();
      
      // Notify that the chain was updated
      if (this.onChainUpdated) {
        this.onChainUpdated();
      }
    } else {
      console.error(`Node ${this.nodeId}: Failed to add self-mined block to chain - this should never happen!`);
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
}

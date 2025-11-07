import { Block, Account } from '../../types/types';
import { createGenesisBlock } from './block';
import { WorldState } from './worldState';
import { validateBlock, calculateBlockHeaderHash } from '../validation/blockValidator';
import { validateChain } from '../validation/chainValidator';
import { BlockchainTree } from './blockchainTree';

/**
 * Blockchain class with tree structure for fork management
 * Uses null root architecture to support multiple genesis blocks
 * Tree is single source of truth, canonical chain computed from HEAD pointer
 */
export class Blockchain {
  private blockTree: BlockchainTree;  // Block Tree with null root (single source of truth)
  private worldState: WorldState;
  private nodeId: string;
  private minerAddress: string;
  private beaconState?: any;  // Optional reference to BeaconState for rebuilding processed attestations
  
  constructor(nodeId: string, minerAddress: string) {
    this.nodeId = nodeId;
    this.minerAddress = minerAddress;
    this.worldState = new WorldState();
    
    // Initialize tree with null root
    this.blockTree = new BlockchainTree();
    
    // Create and add this node's genesis block
    const genesisBlock = createGenesisBlock(this.nodeId, this.minerAddress);
    this.blockTree.addBlock(genesisBlock);
    this.blockTree.setHead(genesisBlock.hash || '');
    
    // Initialize world state from genesis
    this.worldState = WorldState.fromBlocks([genesisBlock]);
  }
  
  /**
   * Sets the BeaconState reference for rebuilding processed attestations
   */
  setBeaconState(beaconState: any): void {
    this.beaconState = beaconState;
  }
  
  /**
   * Gets all blocks in the canonical blockchain (computed from tree)
   */
  getBlocks(): Block[] {
    return this.blockTree.getCanonicalChain();
  }
  
  /**
   * Gets the blockchain tree (for visualization and fork analysis)
   */
  getTree(): BlockchainTree {
    return this.blockTree;
  }
  
  /**
   * Gets the current world state accounts
   */
  getWorldState(): Record<string, Account> {
    return this.worldState.accounts;
  }
  
  /**
   * Gets the transaction receipts database
   */
  getReceipts(): any {
    return this.worldState.receipts;
  }
  
  /**
   * Gets the latest block in the canonical chain (HEAD)
   */
  getLatestBlock(): Block {
    const head = this.blockTree.getCanonicalHead();
    if (!head.block) {
      throw new Error('HEAD points to null root - no genesis block added');
    }
    return head.block;
  }
  
  /**
   * Gets the current blockchain height (hops from HEAD to null root)
   */
  getHeight(): number {
    return this.blockTree.getHeight();
  }
  
  /**
   * Adds a new block to the chain if valid
   * Adds to tree and updates HEAD if it extends the canonical chain
   * Returns true if the block was added, false otherwise
   */
  async addBlock(block: Block): Promise<boolean> {
    // Ensure block has a hash
    if (!block.hash) {
      block.hash = calculateBlockHeaderHash(block.header);
    }
    
    // Add block to tree (handles genesis blocks and regular blocks)
    const treeNode = this.blockTree.addBlock(block);
    if (!treeNode) {
      console.error(`Failed to add block ${block.hash} to tree - parent not found`);
      return false;
    }
    
    // Check if this block extends the current canonical chain
    const currentHead = this.blockTree.getCanonicalHead();
    const extendsCanonical = block.header.previousHeaderHash === (currentHead.block?.hash || '');
    
    if (extendsCanonical) {
      // Validate the block against the current world state
      const previousHash = currentHead.block?.hash || '';
      const isValid = await validateBlock(block, this.worldState, previousHash);
      
      if (!isValid) {
        console.error(`Block ${block.hash} is invalid`);
        return false;
      }
      
      // Update world state with all transactions in the block
      for (let i = 0; i < block.transactions.length; i++) {
        this.worldState.updateWithTransaction(
          block.transactions[i],
          block.hash,
          block.header.height,
          i
        );
      }
      
      // Update HEAD to point to this block (extends canonical chain)
      this.blockTree.setHead(block.hash);
      
      // Rebuild processed attestations from new canonical chain
      if (this.beaconState) {
        const canonicalChain = this.blockTree.getCanonicalChain();
        this.beaconState.rebuildProcessedAttestations(canonicalChain);
      }
      
      return true;
    } else {
      // Block creates a fork - added to tree but doesn't update HEAD or world state
      console.log(`Block ${block.hash} added as fork at height ${block.header.height}`);
      return true;
    }
  }
  
  /**
   * Replaces the current chain with a new one if it's valid and longer
   * Adds all new blocks to tree and updates HEAD pointer
   * Returns true if the chain was replaced, false otherwise
   */
  async replaceChain(newBlocks: Block[]): Promise<boolean> {
    // Validate the new chain
    const isValid = await this.isValidChain(newBlocks);
    if (!isValid) {
      return false;
    }
    
    // Check if the new chain is longer than current canonical chain
    const currentCanonicalChain = this.blockTree.getCanonicalChain();
    if (newBlocks.length <= currentCanonicalChain.length) {
      return false;
    }
    
    // Add all blocks from new chain to tree (preserves forks)
    for (const block of newBlocks) {
      const existingNode = this.blockTree.getNode(block.hash || '');
      if (!existingNode) {
        // New block - add to tree
        this.blockTree.addBlock(block);
      }
    }
    
    // Update HEAD to point to the last block of the new chain
    const lastBlock = newBlocks[newBlocks.length - 1];
    this.blockTree.setHead(lastBlock.hash || '');
    
    // Rebuild world state from the new canonical chain
    this.worldState = WorldState.fromBlocks(newBlocks);
    
    // Rebuild processed attestations from the new canonical chain
    if (this.beaconState) {
      this.beaconState.rebuildProcessedAttestations(newBlocks);
    }
    
    return true;
  }
  
  /**
   * Validates a chain of blocks
   */
  private async isValidChain(chain: Block[]): Promise<boolean> {
    return await validateChain(chain);
  }
  
  /**
   * Gets a block by its hash (searches tree)
   */
  getBlockByHash(hash: string): Block | undefined {
    const node = this.blockTree.getNode(hash);
    return node?.block || undefined;
  }
  
  /**
   * Gets a block by its height (from canonical chain)
   */
  getBlockByHeight(height: number): Block | undefined {
    const canonicalChain = this.blockTree.getCanonicalChain();
    return height >= 0 && height < canonicalChain.length ? canonicalChain[height] : undefined;
  }
}

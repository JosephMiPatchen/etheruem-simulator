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
  private tree: BlockchainTree;  // Tree with null root (single source of truth)
  private worldState: WorldState;
  private nodeId: string;
  private minerAddress: string;
  
  constructor(nodeId: string, minerAddress: string) {
    this.nodeId = nodeId;
    this.minerAddress = minerAddress;
    this.worldState = new WorldState();
    
    // Initialize tree with null root
    this.tree = new BlockchainTree();
    
    // Create and add this node's genesis block
    const genesisBlock = createGenesisBlock(this.nodeId, this.minerAddress);
    this.tree.addBlock(genesisBlock);
    this.tree.setHead(genesisBlock.hash || '');
    
    // Initialize world state from genesis
    this.worldState = WorldState.fromBlocks([genesisBlock]);
  }
  
  /**
   * Gets all blocks in the canonical blockchain (computed from tree)
   */
  getBlocks(): Block[] {
    return this.tree.getCanonicalChain();
  }
  
  /**
   * Gets the blockchain tree (for visualization and fork analysis)
   */
  getTree(): BlockchainTree {
    return this.tree;
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
    const head = this.tree.getCanonicalHead();
    if (!head.block) {
      throw new Error('HEAD points to null root - no genesis block added');
    }
    return head.block;
  }
  
  /**
   * Gets the current blockchain height (hops from HEAD to null root)
   */
  getHeight(): number {
    return this.tree.getHeight();
  }
  
  /**
   * Adds a new block to the chain if valid
   * Returns true if the block was added, false otherwise
   * Note: This method should not be used for genesis blocks (height 0)
   */
  async addBlock(block: Block): Promise<boolean> {
    // Reject genesis blocks (height 0)
    if (block.header.height === 0) {
      console.error('Genesis blocks should be added directly, not through addBlock');
      return false;
    }
    
    // Ensure block has a hash
    if (!block.hash) {
      block.hash = calculateBlockHeaderHash(block.header);
    }
    
    // Get the previous block
    const previousBlock = this.blocks.length > 0 ? this.blocks[this.blocks.length - 1] : null;
    
    // Validate the block
    if (!previousBlock) {
      console.error('Cannot add block without a previous block');
      return false;
    }
    
    // Validate block height is sequential (exactly one more than the current chain height)
    const expectedHeight = previousBlock.header.height + 1;
    if (block.header.height !== expectedHeight) {
      console.error(`Block height mismatch: expected ${expectedHeight}, got ${block.header.height}`);
      return false;
    }
    
    // Validate the block against the previous block's hash
    const previousHash = previousBlock.hash || '';
    const isValid = await validateBlock(block, this.worldState, previousHash);
    if (!isValid) {
      return false;
    }
    
    // Update world state with all transactions in the block
    // Pass block context for receipt creation
    for (let i = 0; i < block.transactions.length; i++) {
      this.worldState.updateWithTransaction(
        block.transactions[i],
        block.hash,
        block.header.height,
        i
      );
    }
    
    // Add the block to the chain
    this.blocks.push(block);
    
    return true;
  }
  
  /**
   * Replaces the current chain with a new one if it's valid and longer
   * Returns true if the chain was replaced, false otherwise
   */
  async replaceChain(newBlocks: Block[]): Promise<boolean> {
    // Validate the new chain
    const isValid = await this.isValidChain(newBlocks);
    if (!isValid) {
      return false;
    }
    
    // Check if the new chain is longer
    if (newBlocks.length <= this.blocks.length) {
      return false;
    }
    
    // Replace the chain
    this.blocks = [...newBlocks];
    
    // Rebuild the world state
    this.worldState = WorldState.fromBlocks(this.blocks);
    
    return true;
  }
  
  /**
   * Validates a chain of blocks
   */
  private async isValidChain(chain: Block[]): Promise<boolean> {
    return await validateChain(chain);
  }
  
  /**
   * Gets a block by its hash
   */
  getBlockByHash(hash: string): Block | undefined {
    return this.blocks.find(block => block.hash === hash);
  }
  
  /**
   * Gets a block by its height
   */
  getBlockByHeight(height: number): Block | undefined {
    return height >= 0 && height < this.blocks.length ? this.blocks[height] : undefined;
  }
}

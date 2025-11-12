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
    
    // Apply genesis block to world state
    this.applyBlockToState(genesisBlock);
    
    // Initialize LMD-GHOST with genesis as GHOST-HEAD
    if (this.beaconState) {
      this.updateLatestAttestationsAndTree();
    }
    this.worldState = WorldState.fromBlocks([genesisBlock]);
  }
  
  /**
   * Sets the BeaconState reference for rebuilding processed attestations
   * Also sets blockchain reference in BeaconState for eager tree updates
   * Initializes ghostHead to genesis block
   */
  setBeaconState(beaconState: any): void {
    this.beaconState = beaconState;
    // Set bidirectional reference so BeaconState can trigger tree updates
    if (beaconState) {
      beaconState.setBlockchain(this);
      
      // Initialize ghostHead to genesis block (all nodes have same genesis)
      const genesisBlock = this.blockTree.getAllBlocks().find(b => b.header.height === 0);
      if (genesisBlock && genesisBlock.hash) {
        beaconState.lmdGhost.setInitialGenesisHead(genesisBlock.hash);
      }
    }
  }
  
  /**
   * Gets all blocks in the canonical blockchain (computed from GHOST-HEAD)
   */
  getBlocks(): Block[] {
    const ghostHead = this.beaconState?.ghostHead;
    return this.blockTree.getCanonicalChain(ghostHead);
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
   * Gets the WorldState object for validation
   */
  getWorldStateObject(): WorldState {
    return this.worldState;
  }
  
  /**
   * Gets the transaction receipts database
   */
  getReceipts(): any {
    return this.worldState.receipts;
  }
  
  /**
   * Gets the latest block in the canonical chain (GHOST-HEAD)
   * ghostHead is initialized to genesis block and updated by LMD-GHOST fork choice
   */
  getLatestBlock(): Block | null {
    const ghostHead = this.beaconState?.ghostHead;
    const head = this.blockTree.getCanonicalHead(ghostHead);
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
    
    // Check if this block extends the current canonical chain (GHOST-HEAD)
    const ghostHead = this.beaconState?.ghostHead;
    const currentHead = this.blockTree.getCanonicalHead(ghostHead);
    const extendsCanonical = block.header.previousHeaderHash === (currentHead.block?.hash || '');
    
    if (extendsCanonical) {
      // Validate the block against the current world state
      const previousHash = currentHead.block?.hash || '';
      const isValid = await validateBlock(block, this.worldState, previousHash);
      
      if (!isValid) {
        console.error(`Block ${block.hash} is invalid`);
        return false;
      }
      
      // Apply this block's state changes (world state + beacon state)
      this.applyBlockToState(block);
      
      // Update LMD GHOST tree decoration (latest attestations + attestedEth)
      // This also computes GHOST-HEAD, which determines the canonical chain
      this.updateLatestAttestationsAndTree();
      
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
    
    // Check if the new chain is longer than current canonical chain (GHOST-HEAD)
    const ghostHead = this.beaconState?.ghostHead;
    const currentCanonicalChain = this.blockTree.getCanonicalChain(ghostHead);
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
    
    // Rebuild both world state and beacon state from scratch by applying each block
    // Reset to initial state first
    this.worldState = new WorldState();
    if (this.beaconState) {
      this.beaconState.clearProcessedAttestations();
      
      // TODO: When implementing full PoS, also reset:
      // - RANDAO mixes (back to genesis)
      // - Validator balances (back to initial stakes)
      // - Slashing records (clear all)
      // - Finality checkpoints (back to genesis)
      // - Epoch schedule (regenerate from genesis)
    }
    
    // Apply each block in the new canonical chain to rebuild state
    for (const block of newBlocks) {
      this.applyBlockToState(block);
    }
    
    // Rebuild LMD GHOST tree decoration from scratch (latest attestations + attestedEth)
    this.rebuildLatestAttestationsAndTree();
    
    return true;
  }
  
  /**
   * Validates a chain of blocks
   */
  private async isValidChain(chain: Block[]): Promise<boolean> {
    return await validateChain(chain);
  }
  
  /**
   * Applies a block's state changes to both world state and beacon state
   * This is the single source of truth for how blocks modify state
   */
  private applyBlockToState(block: Block): void {
    // ========== World State Updates (Execution Layer) ==========
    // Apply all transactions in the block to world state
    for (let i = 0; i < block.transactions.length; i++) {
      this.worldState.updateWithTransaction(
        block.transactions[i],
        block.hash,
        block.header.height,
        i
      );
    }
    
    // ========== Beacon State Updates (Consensus Layer) ==========
    if (this.beaconState) {
      // Mark all attestations in this block as processed and remove from beacon pool
      if (block.attestations && block.attestations.length > 0) {
        const poolSizeBefore = this.beaconState.beaconPool.length;
        for (const attestation of block.attestations) {
          // Mark as processed to prevent duplicate inclusion
          this.beaconState.markAttestationAsProcessed(attestation.blockHash, attestation.validatorAddress);
          
          // Remove from beacon pool (cleanup)
          const poolSizeBeforeFilter = this.beaconState.beaconPool.length;
          this.beaconState.beaconPool = this.beaconState.beaconPool.filter(
            (att: any) => !(att.validatorAddress === attestation.validatorAddress && att.blockHash === attestation.blockHash)
          );
          const removed = poolSizeBeforeFilter - this.beaconState.beaconPool.length;
          if (removed === 0) {
            console.warn(`[Blockchain] Attestation not found in beacon pool: ${attestation.blockHash.slice(0, 8)}-${attestation.validatorAddress.slice(-4)}`);
          }
        }
        console.log(`[Blockchain] Beacon pool cleanup: ${poolSizeBefore} -> ${this.beaconState.beaconPool.length} (removed ${poolSizeBefore - this.beaconState.beaconPool.length})`);
      }
      
      // TODO: When implementing full PoS, also update:
      // - RANDAO mixes (XOR with new block's RANDAO reveal)
      // - Validator balances (apply rewards/penalties)
      // - Slashing records (if any slashings in block)
      // - Finality checkpoints (update justified/finalized epochs)
    }
  }
  
  /**
   * Update latest attestations and tree decoration
   * Delegates to BeaconState (consensus layer logic)
   */
  updateLatestAttestationsAndTree(): void {
    if (this.beaconState) {
      this.beaconState.updateLatestAttestationsAndTree();
    }
  }
  
  /**
   * Full rebuild of latest attestations and attestedEth
   * Delegates to BeaconState (consensus layer logic)
   */
  rebuildLatestAttestationsAndTree(): void {
    if (this.beaconState) {
      this.beaconState.rebuildLatestAttestationsAndTree();
    }
  }
  
  /**
   * Gets a block by its hash (searches tree)
   */
  getBlockByHash(hash: string): Block | undefined {
    const node = this.blockTree.getNode(hash);
    return node?.block || undefined;
  }
  
  /**
   * Gets a block by its height (from canonical chain determined by GHOST-HEAD)
   */
  getBlockByHeight(height: number): Block | undefined {
    const ghostHead = this.beaconState?.ghostHead;
    const canonicalChain = this.blockTree.getCanonicalChain(ghostHead);
    return height >= 0 && height < canonicalChain.length ? canonicalChain[height] : undefined;
  }
}

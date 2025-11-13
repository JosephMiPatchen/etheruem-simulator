import { Block, Account } from '../../types/types';
import { BlockCreator } from './blockCreator';
import { WorldState } from './worldState';
import { validateBlock, calculateBlockHeaderHash } from '../validation/blockValidator';
import { validateChain } from '../validation/chainValidator';
import { BlockchainTree, BlockTreeNode } from './blockchainTree';
import { LmdGhost } from '../consensus/LmdGhost';
import { RANDAO } from '../consensus/randao';
import { SimulatorConfig } from '../../config/config';

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
    
    // Create and add shared genesis block (same for all nodes)
    const genesisBlock = BlockCreator.createGenesisBlock();
    this.blockTree.addBlock(genesisBlock);
    
    // Apply genesis block to world state
    this.applyBlockToElAndClState(genesisBlock);
  
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
        LmdGhost.setInitialGenesisHead(this.blockTree, genesisBlock.hash);
      }
    }
  }
  
  /**
   * Gets all blocks in the canonical blockchain (computed from GHOST-HEAD)
   * Uses the current GHOST-HEAD automatically
   */
  getCanonicalChain(): Block[] {
    return this.blockTree.getCanonicalChain();
  }
  
  /**
   * Gets all blocks in the canonical blockchain (alias for getCanonicalChain)
   */
  getBlocks(): Block[] {
    return this.getCanonicalChain();
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
   * Gets the latest block (canonical chain tip from GHOST-HEAD)
   * Uses current GHOST-HEAD automatically
   */
  getLatestBlock(): Block | null {
    const head = this.blockTree.getCanonicalHead();
    return head ? head.block : null;
  }
  
  /**
   * Gets the current blockchain height (latest block height)
   */
  getHeight(): number {
    const latestBlock = this.getLatestBlock();
    return latestBlock ? latestBlock.header.height : 0;
  }
  
  /**
   * Adds a single block to the blockchain
   * 
   * GHOST-HEAD Change Rule:
   * - If block extends canonical chain → GHOST-HEAD moves forward (forward progress)
   * - If block creates a fork → GHOST-HEAD stays the same
   * - CANNOT cause reorg (attestations in block are not considered for fork choice)
   * 
   * Note: Reorgs only happen when new attestation messages arrive (see onAttestationReceived)
   * 
   * Returns true if block was added successfully, false otherwise
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
    const currentHead = this.blockTree.getCanonicalHead();
    const extendsCanonical = block.header.previousHeaderHash === (currentHead!.block?.hash || '');
    
    if (extendsCanonical) {
      // Validate the block against the current world state
      const previousHash = currentHead!.block?.hash || '';
      const isValid = await validateBlock(block, this.worldState, previousHash);
      
      if (!isValid) {
        console.error(`Block ${block.hash} is invalid`);
        return false;
      }
      
      // Apply this block's state changes (world state + beacon state)
      this.applyBlockToElAndClState(block);
      
      // GHOST-HEAD moves forward (forward progress)
      // Note: We don't need to check for reorg here because we're extending canonical
      const oldHead = currentHead?.block?.hash;
      this.blockTree.setGhostHead(block.hash);
      
      console.log(`[Blockchain] GHOST-HEAD moved forward: ${oldHead?.slice(0, 8)} → ${block.hash?.slice(0, 8)}`);
      
      return true;
    } else {
      // Block creates a fork - added to tree but doesn't update GHOST-HEAD or world state
      console.log(`[Blockchain] Block ${block.hash?.slice(0, 8)} added as fork at height ${block.header.height}`);
      return true;
    }
  }
  
  /**
   * Adds a chain of blocks to the blockchain
   * Used during sync when receiving multiple blocks from peers
   * 
   * GHOST-HEAD Change Rule:
   * - If chain extends canonical chain → GHOST-HEAD moves forward (forward progress)
   * - If chain creates forks → GHOST-HEAD stays the same
   * - CANNOT cause reorg (attestations in blocks are not considered for fork choice)
   * 
   * Note: Reorgs only happen when new attestation messages arrive (see onAttestationReceived)
   * 
   * Returns true if all blocks were added successfully, false otherwise
   */
  async addChain(newBlocks: Block[]): Promise<boolean> {
    // Validate the chain structure first
    const isValid = await this.isValidChain(newBlocks);
    if (!isValid) {
      console.error('[Blockchain] Invalid chain structure');
      return false;
    }
    
    // Add each block using addBlock to ensure proper validation and state updates
    // Each addBlock call will move GHOST-HEAD forward if block extends canonical
    let allAdded = true;
    for (const block of newBlocks) {
      const added = await this.addBlock(block);
      if (!added) {
        console.warn(`[Blockchain] Failed to add block ${block.hash?.slice(0, 8)} at height ${block.header.height}`);
        allAdded = false;
        // Continue adding remaining blocks - they might succeed if they're on a different fork
      }
    }
    
    return allAdded;
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
  private applyBlockToElAndClState(block: Block): void {
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
    
    // Update RANDAO mix with this block's reveal
    // In PoS, every block must include a RANDAO reveal
    if (!block.randaoReveal) {
      throw new Error(`Block ${block.hash} is missing randaoReveal - required for PoS`);
    }
    
    // Calculate epoch from slot: epoch = floor(slot / SLOTS_PER_EPOCH)
    const epoch = Math.floor(block.header.slot / SimulatorConfig.SLOTS_PER_EPOCH);
    
    // Update RANDAO mix: new_mix = current_mix XOR reveal
    RANDAO.updateRandaoMix(this.beaconState, epoch, block.randaoReveal);
    
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
    // - Validator balances (apply rewards/penalties)
    // - Slashing records (if any slashings in block)
    // - Finality checkpoints (update justified/finalized epochs)
  }
  
  /**
   * Called when a new attestation message is received
   * This is the single source of truth for attestation processing
   * 
   * Complete Flow:
   * 1. Update latest attestations (per-validator map)
   * 2. Update tree attestedEth values
   * 3. Compute new GHOST-HEAD based on attestations
   * 4. Check if GHOST-HEAD moved:
   *    - Stayed same → No action needed
   *    - Moved forward → Apply new blocks to state
   *    - Moved to different fork → Reorg (rebuild entire state)
   * 
   * This is the ONLY way reorgs can happen (not via block/chain addition)
   * 
   * @param attestation - The attestation to process
   */
  onAttestationReceived(attestation: any): void {
    // Save old GHOST-HEAD to detect changes
    const oldGhostHead = this.blockTree.getGhostHead();
    
    // 1. Update latest attestations (per-validator map)
    const existing = this.beaconState.latestAttestations.get(attestation.validatorAddress);
    if (!existing || attestation.timestamp > existing.timestamp) {
      this.beaconState.latestAttestations.set(attestation.validatorAddress, attestation);
    }
    
    // 2. Update tree attestedEth values and compute new GHOST-HEAD
    // This uses the latest attestations to decorate tree and determine canonical chain
    LmdGhost.onAttestationSetChanged(this.beaconState, this.blockTree, 
      Array.from(this.beaconState.latestAttestations.values()));
    
    // 3. Get new GHOST-HEAD after attestation update
    const newGhostHead = this.blockTree.getGhostHead();
    
    // 4. Check if GHOST-HEAD changed and handle accordingly
    if (oldGhostHead !== newGhostHead) {
      // GHOST-HEAD changed - determine what to do
      const isReorg = !this.isDescendant(newGhostHead, oldGhostHead);
      
      if (isReorg) {
        // ❌ Reorganization: GHOST-HEAD switched to a different fork
        console.log(`[Blockchain] REORG: ${oldGhostHead?.slice(0, 8)} → ${newGhostHead?.slice(0, 8)} (rebuilding state)`);
        
        // Rebuild world state and beacon state from scratch
        this.worldState = new WorldState();
        this.beaconState.clearProcessedAttestations();
        
        // Apply each block in the new canonical chain to rebuild state
        // Note: GHOST-HEAD is already updated to newGhostHead, so getCanonicalChain() uses it
        const canonicalChain = this.getCanonicalChain();
        for (const block of canonicalChain) {
          this.applyBlockToElAndClState(block);
        }
      } else {
        // ✅ Forward Progress: GHOST-HEAD moved down same chain
        console.log(`[Blockchain] GHOST-HEAD moved forward via attestation: ${oldGhostHead?.slice(0, 8)} → ${newGhostHead?.slice(0, 8)}`);
        
        // Apply blocks between old and new GHOST-HEAD to state
        const blocksToApply = this.getBlocksBetween(oldGhostHead, newGhostHead);
        for (const block of blocksToApply) {
          this.applyBlockToElAndClState(block);
        }
      }
    }
    // else: GHOST-HEAD stayed same - no action needed
  }
  
  /**
   * Check if newHead is a descendant of oldHead
   * Used to determine if GHOST-HEAD change is forward progress or reorg
   */
  private isDescendant(newHead: string | null, oldHead: string | null): boolean {
    if (!newHead || !oldHead) return false;
    if (newHead === oldHead) return true;
    
    // Walk up from new head to see if we reach old head
    let current: BlockTreeNode | null | undefined = this.blockTree.getNode(newHead);
    while (current) {
      if (current.hash === oldHead) {
        return true;  // newHead is descendant of oldHead
      }
      current = current.parent;
    }
    
    return false;  // newHead is NOT descendant of oldHead (reorg!)
  }
  
  /**
   * Get blocks between oldHead and newHead (exclusive of oldHead, inclusive of newHead)
   * Used when GHOST-HEAD moves forward to apply new blocks to state
   */
  private getBlocksBetween(oldHead: string | null, newHead: string | null): Block[] {
    if (!newHead) return [];
    
    const blocks: Block[] = [];
    let current: BlockTreeNode | null | undefined = this.blockTree.getNode(newHead);
    
    // Walk up from new head to old head, collecting blocks
    while (current && current.hash !== oldHead) {
      if (current.block) {
        blocks.unshift(current.block);  // Add to front to maintain order
      }
      current = current.parent;
    }
    
    return blocks;
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
    const canonicalChain = this.getCanonicalChain();
    return height >= 0 && height < canonicalChain.length ? canonicalChain[height] : undefined;
  }
}

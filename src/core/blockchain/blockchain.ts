import { Block, Account } from '../../types/types';
import { BlockCreator } from './blockCreator';
import { WorldState } from './worldState';
import { validateBlock, calculateBlockHeaderHash } from '../validation/blockValidator';
import { lightValidateChain } from '../validation/chainValidator';
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
  private beaconState: any;  // Reference to BeaconState for RANDAO and attestation processing
  
  constructor(nodeId: string, minerAddress: string, beaconState: any) {
    this.nodeId = nodeId;
    this.minerAddress = minerAddress;
    this.beaconState = beaconState;
    this.worldState = new WorldState();
    
    // Initialize tree with null root
    this.blockTree = new BlockchainTree();
    
    // Create and add shared genesis block (same for all nodes)
    const genesisBlock = BlockCreator.createGenesisBlock();
    this.blockTree.addBlock(genesisBlock);
    
    // Apply genesis block to both execution and consensus layers
    this.applyBlockToElAndClState(genesisBlock);
    
    // Set blockchain reference in BeaconState for eager tree updates
    this.beaconState.setBlockchain(this);
  }
  
  /**
   * Gets the BeaconState reference
   */
  getBeaconState(): any {
    return this.beaconState;
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
    // 1. Ensure block has a hash
    if (!block.hash) {
      block.hash = calculateBlockHeaderHash(block.header);
    }
    
    // 2. Get old GHOST-HEAD before adding block
    const oldGhostHead = this.blockTree.getGhostHead();
    
    // 3. Add block to tree (creates tree node, doesn't validate yet)
    const newNode = this.blockTree.addBlock(block);
    if (!newNode) {
      console.error(`[Blockchain] Failed to add block ${block.hash} - parent not found`);
      return false;
    }
    
    // 4. Get new GHOST-HEAD after adding block (recomputed via LMD-GHOST)
    const newGhostHead = this.blockTree.getGhostHead();
    
    // 5. Check if new GHOST-HEAD would extend canonical chain
    // This happens when new GHOST-HEAD's parent is the old GHOST-HEAD
    const wouldExtendCanonical = newGhostHead?.parent?.hash === oldGhostHead?.hash;
    
    if (wouldExtendCanonical) {
      // 6. Validate and apply block (or mark invalid if validation fails)
      const previousHash = oldGhostHead?.hash || '';
      const applied = await this.validateAndApplyBlock(block, previousHash);
      
      if (applied) {
        console.log(`[Blockchain] Block ${block.hash?.slice(0, 8)} applied to canonical chain`);
      }
      return true;
    } else {
      // Block creates a fork - added to tree but not validated yet
      // Will be validated later if it becomes canonical via attestations
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
    
    // Filter out blocks we already have
    // Start from the beginning and find the first block we don't have
    const tree = this.blockTree;
    const blocksToAdd: Block[] = [];
    
    for (const block of newBlocks) {
      const existingNode = tree.getNode(block.hash || '');
      if (!existingNode) {
        // We don't have this block, add it and all subsequent blocks
        blocksToAdd.push(block);
      }
      // If we have it, continue checking (we might have gaps)
    }
    
    if (blocksToAdd.length === 0) {
      // We already have all blocks in this chain
      return true;
    }
    
    // Add each new block using addBlock to ensure proper validation and state updates
    // Each addBlock call will move GHOST-HEAD forward if block extends canonical
    for (const block of blocksToAdd) {
      if (!await this.addBlock(block)) {
        console.warn(`[Blockchain] Failed to add block ${block.hash?.slice(0, 8)} at height ${block.header.height}`);
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Validates a chain of blocks
   */
  private async isValidChain(chain: Block[]): Promise<boolean> {
    return await lightValidateChain(chain);
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
    // Calculate epoch from slot: epoch = floor(slot / SLOTS_PER_EPOCH)
    const epoch = Math.floor(block.header.slot / SimulatorConfig.SLOTS_PER_EPOCH);
    
    // Update RANDAO mix for NEXT epoch: new_mix = current_mix XOR reveal
    // We update epoch+1 so the mix is available when computing the schedule for epoch+1
    // (which needs the mix from epoch, i.e., the current epoch)
    // All blocks including genesis have RANDAO reveal
    const nextEpoch = epoch + 1;
    RANDAO.updateRandaoMix(this.beaconState, nextEpoch, block.randaoReveal!);
    
    // Mark all attestations in this block as processed and remove from beacon pool
    if (block.attestations && block.attestations.length > 0) {
      const poolSizeBefore = this.beaconState.beaconPool.length;
      for (const attestation of block.attestations) {
        // Update latest attestation for this validator (for LMD-GHOST)
        const existing = this.beaconState.latestAttestations.get(attestation.validatorAddress);
        if (!existing || attestation.timestamp > existing.timestamp) {
          this.beaconState.latestAttestations.set(attestation.validatorAddress, attestation);
        }
        
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
      
      // Update latest attestations and decorate tree for LMD-GHOST
      // This ensures fork choice considers the new attestations
      this.updateLatestAttestationsAndTree();
    }
    // TODO: When implementing full PoS, also update:
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
   *    - Moved forward → Validate and apply new blocks to state
   *    - Moved to different fork → Reorg (rebuild entire state, validate all blocks)
   * 
   * This is the ONLY way reorgs can happen (not via block/chain addition)
   * 
   * @param attestation - The attestation to process
   */
  async onAttestationReceived(attestation: any): Promise<void> {
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
    if (oldGhostHead?.hash !== newGhostHead?.hash) {
      // GHOST-HEAD changed - determine what to do
      const isReorg = !this.isDescendant(newGhostHead, oldGhostHead);
      
      if (isReorg) {
        // ❌ Reorganization: GHOST-HEAD switched to a different fork
        console.log(`[Blockchain] REORG: ${oldGhostHead?.hash?.slice(0, 8)} → ${newGhostHead?.hash?.slice(0, 8)}`);
        
        // Retry state rebuild until valid canonical chain found
        // Each failure marks block invalid → tree redecorated → GHOST-HEAD recomputed
        for (let attempt = 0; attempt < 10; attempt++) {
          if (await this.rebuildStateFromCanonicalChain()) {
            break; // Success
          }
          console.log(`[Blockchain] Invalid block (retry ${attempt + 1}/10) - new head: ${this.blockTree.getGhostHead()?.hash?.slice(0, 8)}`);
        }
      } else {
        // ✅ Forward Progress: GHOST-HEAD moved down same chain
        console.log(`[Blockchain] GHOST-HEAD moved forward via attestation: ${oldGhostHead?.hash?.slice(0, 8)} → ${newGhostHead?.hash?.slice(0, 8)}`);
        
        // Validate and apply blocks between old and new GHOST-HEAD
        // Stop if any block is invalid
        const blocksToApply = this.getBlocksBetween(oldGhostHead, newGhostHead);
        
        for (const block of blocksToApply) {
          // Each block's previous hash is in its header
          const blockPrevHash = block.header.previousHeaderHash;
          const applied = await this.validateAndApplyBlock(block, blockPrevHash);
          
          if (!applied) {
            // Block is invalid - stop applying blocks
            console.log(`[Blockchain] Block ${block.hash?.slice(0, 8)} invalid - stopping forward progress`);
            break;
          }
        }
      }
    }
    // else: GHOST-HEAD stayed same - no action needed
  }
  
  /**
   * Clear all blockchain state (world state and beacon state)
   * Called during reorg to reset to clean state before rebuilding
   * 
   * Clears:
   * - World state (account balances, nonces, etc.)
   * - Processed attestations
   * - RANDAO mixes (re-initialized to genesis)
   * - Proposer schedules
   */
  private clearAllState(): void {
    this.worldState = new WorldState();
    this.beaconState.clearProcessedAttestations();
    this.beaconState.clearRandaoState();
  }
  
  /**
   * Rebuild world state and beacon state from canonical chain
   * Clears current state and validates/applies all blocks in canonical chain
   * 
   * On reorg:
   * - All state cleared via clearAllState()
   * - RANDAO mixes rebuilt as blocks applied
   * - Proposer schedules recomputed lazily by Consensus
   * 
   * @returns true if all blocks applied successfully, false if any block invalid
   */
  private async rebuildStateFromCanonicalChain(): Promise<boolean> {
    // Clear all state
    this.clearAllState();
    
    // Validate and apply each block in canonical chain
    // This rebuilds RANDAO mixes (proposer schedules recomputed lazily)
    const canonicalChain = this.getCanonicalChain();
    for (let i = 0; i < canonicalChain.length; i++) {
      const block = canonicalChain[i];
      const previousHash = i > 0 ? canonicalChain[i - 1].hash || '' : '';
      const applied = await this.validateAndApplyBlock(block, previousHash);
      
      if (!applied) {
        // Block is invalid - state rebuild incomplete
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Validate and apply a block to world state and beacon state
   * If validation fails, marks the block as invalid in the tree
   * 
   * @param block - Block to validate and apply
   * @param previousHash - Hash of the previous block (for validation context)
   * @returns true if block is valid and was applied, false if invalid
   */
  private async validateAndApplyBlock(block: Block, previousHash: string): Promise<boolean> {
    // Get the tree node for this block
    const node = this.blockTree.getNode(block.hash || '');
    if (!node) {
      console.error(`[Blockchain] Cannot validate block ${block.hash} - not in tree`);
      return false;
    }
    
    // Skip if already marked invalid
    if (node.metadata.isInvalid) {
      return false;
    }
    
    // Validate block against current world state
    const isValid = await validateBlock(block, this.worldState, previousHash);
    
    if (!isValid) {
      // Mark block as invalid and redecorate tree
      // Tree decoration happens in two cases:
      // 1. When attestations change (onAttestationSetChanged)
      // 2. When nodes marked invalid (here)
      this.blockTree.markNodeInvalid(block.hash || '', this.beaconState);
      console.log(`[Blockchain] Block ${block.hash?.slice(0, 8)} marked invalid - GHOST will skip it`);
      return false;
    } else {
      // Block is valid - apply state changes
      this.applyBlockToElAndClState(block);
      return true; 
    }
  }
  
  /**
   * Check if newHead is a descendant of oldHead
   * Used to determine if GHOST-HEAD change is forward progress or reorg
   */
  private isDescendant(newHead: BlockTreeNode | null, oldHead: BlockTreeNode | null): boolean {
    if (!newHead || !oldHead) return false;
    if (newHead.hash === oldHead.hash) return true;
    
    // Walk up from new head to see if we reach old head
    let current: BlockTreeNode | null | undefined = newHead;
    while (current) {
      if (current.hash === oldHead.hash) {
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
  private getBlocksBetween(oldHead: BlockTreeNode | null, newHead: BlockTreeNode | null): Block[] {
    if (!newHead) return [];
    
    const blocks: Block[] = [];
    let current: BlockTreeNode | null | undefined = newHead;
    
    // Walk up from new head to old head, collecting blocks
    while (current && current.hash !== oldHead?.hash) {
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

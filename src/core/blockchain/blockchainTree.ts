/**
 * Blockchain Tree Structure with Genesis Root
 * 
 * Architecture:
 * - Genesis block (height 0) is the root of the tree
 * - All nodes share the same deterministic genesis block
 * - All other blocks descend from genesis
 * - Supports GHOST/LMD-GHOST fork-choice
 */

import { Block } from '../../types/types';
import { LmdGhost }  from '../consensus/LmdGhost';
/**
 * Tree node wrapping a block with metadata
 * Extensible for future metadata (attestations, weight, etc.)
 */
export interface BlockTreeNode {
  block: Block;
  hash: string;
  parent: BlockTreeNode | null;  // null only for genesis (root)
  children: BlockTreeNode[];
  
  // Metadata (extensible for future use)
  metadata: {
    weight?: number;           // For GHOST: total attestation weight
    attestationCount?: number; // Number of attestations
    attestedEth?: number;      // For LMD GHOST: total staked ETH attesting to this subtree
    isInvalid?: boolean;       // True if block is invalid (failed validation), false/undefined = valid
    [key: string]: any;        // Allow any future metadata
  };
}

/**
 * Blockchain Tree class with Genesis Root
 * Maintains a tree of all blocks starting from a shared genesis block
 * Stores the LMD-GHOST HEAD for fork choice
 */
export class BlockchainTree {
  private root: BlockTreeNode | null;              // Genesis block (root of tree)
  private nodesByHash: Map<string, BlockTreeNode>; // Fast lookup by hash
  private leaves: Set<BlockTreeNode>;              // All leaf nodes (chain tips)
  
  constructor() {
    this.root = null;  // Will be set when genesis block is added
    this.nodesByHash = new Map();
    this.leaves = new Set();
  }
  
  /**
   * Adds a block to the tree
   * Returns the new node if successful, null if parent not found
   */
  addBlock(block: Block): BlockTreeNode | null {
    // Check if block already exists
    if (this.nodesByHash.has(block.hash || '')) {
      console.warn(`Block ${block.hash} already exists in tree`);
      return null;
    }
    
    // Determine parent
    let parentNode: BlockTreeNode | null = null;
    if (block.header.height === 0) {
      // Genesis block - becomes the root (no parent)
      parentNode = null;
    } else {
      // Regular block - find parent by previousHeaderHash
      const parentHash = block.header.previousHeaderHash;
      parentNode = this.nodesByHash.get(parentHash) || null;
      
      if (!parentNode) {
        console.warn(`Parent block ${parentHash} not found in tree`);
        return null;
      }
    }
    
    // Create new node
    const newNode: BlockTreeNode = {
      block,
      hash: block.hash || '',
      parent: parentNode,
      children: [],
      metadata: {
        weight: 0
      }
    };
    
    // If this is genesis (height 0), set as root
    if (block.header.height === 0) {
      this.root = newNode;
    } else {
      // Add to parent's children
      if (parentNode) {
        parentNode.children.push(newNode);
        
        // Update leaves: remove parent if it was a leaf
        if (this.leaves.has(parentNode)) {
          this.leaves.delete(parentNode);
        }
      }
    }
    
    // Add to lookup map
    this.nodesByHash.set(newNode.hash, newNode);
    
    // Add new node as a leaf
    this.leaves.add(newNode);
    
    // Note: Tree decoration is handled by caller via LmdGhost.updateTreeDecorations()
    // GHOST-HEAD is computed on-demand via getGhostHead()
    
    return newNode;
  }
  
  /**
   * Get chain from a specific block hash to genesis
   * Returns blocks in order from genesis to the specified hash
   * 
   * @param blockHash - Hash of the block to get chain for
   */
  getChain(blockHash: string): Block[] {
    const chain: Block[] = [];
    let current: BlockTreeNode | null | undefined = this.nodesByHash.get(blockHash);
    
    // Walk up from block to genesis, collecting blocks
    while (current) {
      if (current.block) {
        chain.unshift(current.block);  // Add to front to maintain order
      }
      current = current.parent;
    }
    
    return chain;
  }
  
  /**
   * Get the canonical chain (from current GHOST-HEAD to genesis)
   * Returns blocks in order from genesis to GHOST-HEAD
   * 
   * For getting chain of a specific hash, use getChain(hash) instead
   */
  getCanonicalChain(): Block[] {
    const headHash = this.getGhostHead()?.hash;
    if (!headHash) {
      return [];
    }
    return this.getChain(headHash);
  }
  
  /**
   * Gets a block node by hash
   */
  getNode(hash: string): BlockTreeNode | undefined {
    return this.nodesByHash.get(hash);
  }
  
  /**
   * Gets all leaf nodes (chain tips)
   */
  getLeaves(): BlockTreeNode[] {
    return Array.from(this.leaves);
  }
  
  /**
   * Get the canonical head node (current GHOST-HEAD)
   * 
   * For getting a specific node by hash, use getNode(hash) instead
   */
  getCanonicalHead(): BlockTreeNode | null {
    return this.getGhostHead();
  }
  
  /**
   * Gets the genesis block (root of tree)
   */
  getRoot(): BlockTreeNode | null {
    return this.root;
  }
  

  
  /**
   * Gets all blocks in the tree (for debugging/visualization)
   */
  getAllNodes(): BlockTreeNode[] {
    return Array.from(this.nodesByHash.values());
  }
  
  /**
   * Gets tree statistics
   */
  getStats(): {
    totalBlocks: number;
    canonicalChainLength: number;
    numberOfLeaves: number;
    numberOfForks: number;
  } {
    return {
      totalBlocks: this.nodesByHash.size,
      canonicalChainLength: this.getCanonicalChain().length,
      numberOfLeaves: this.leaves.size,
      numberOfForks: this.leaves.size - 1 // Forks = leaves - 1
    };
  }
  
  /**
   * Simple tree visualization for debugging
   * Returns a string representation of the tree structure
   * @param ghostHeadHash - Hash of the GHOST-HEAD for canonical chain marking
   */
  visualize(ghostHeadHash?: string | null): string {
    const lines: string[] = [];
    
    if (!this.root) {
      return '[Empty tree - no genesis block]';
    }
    
    // Build set of canonical node hashes by walking from GHOST-HEAD to genesis
    const canonicalHashes = new Set<string>();
    if (ghostHeadHash) {
      let current: BlockTreeNode | null | undefined = this.nodesByHash.get(ghostHeadHash);
      while (current) {
        canonicalHashes.add(current.hash);
        current = current.parent;
      }
    }
    
    const traverse = (node: BlockTreeNode, prefix: string, isLast: boolean) => {
      const marker = isLast ? '└── ' : '├── ';
      const canonical = canonicalHashes.has(node.hash) ? ' [CANONICAL]' : '';
      const isGenesis = node.block.header.height === 0 ? ' [GENESIS]' : '';
      
      const height = node.block.header.height;
      const shortHash = node.hash.substring(0, 8);
      lines.push(`${prefix}${marker}Block ${height} (${shortHash})${canonical}${isGenesis}`);
      
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      node.children.forEach((child, index) => {
        const isLastChild = index === node.children.length - 1;
        traverse(child, childPrefix, isLastChild);
      });
    };
    
    // Start from root (genesis)
    traverse(this.root, '', true);
    
    return lines.join('\n');
  }
  
  /**
   * Get all blocks in the tree
   * Used for collecting all attestations from the blockchain
   */
  getAllBlocks(): Block[] {
    const blocks: Block[] = [];
    
    if (!this.root) {
      return blocks;
    }
    
    const traverse = (node: BlockTreeNode) => {
      blocks.push(node.block);
      node.children.forEach(child => traverse(child));
    };
    
    traverse(this.root);
    return blocks;
  }
  
  /**
   * Mark a node as invalid and update tree attestedEth
   * 
   * This triggers a full tree recomputation because:
   * 1. Invalid node gets isInvalid = true
   * 2. Tree decoration recomputes attestedEth (invalid nodes return 0)
   * 3. GHOST-HEAD will be recomputed on next access (skips invalid nodes)
   * 
   * Tree decoration happens in two cases:
   * - When attestations change (onAttestationSetChanged)
   * - When nodes marked invalid (this method)
   * 
   * @param blockHash - Hash of the block to mark invalid
   * @param beaconState - BeaconState for tree decoration
   */
  markNodeInvalid(blockHash: string, beaconState: any): void {
    const node = this.nodesByHash.get(blockHash);
    if (!node) {
      console.warn(`[BlockchainTree] Cannot mark node ${blockHash} invalid - not found`);
      return;
    }
    
    // Mark node as invalid
    node.metadata.isInvalid = true;
    console.log(`[BlockchainTree] Marked node ${blockHash.slice(0, 8)} invalid`);
    
    // Redecorate entire tree to update attestedEth
    // Invalid nodes will return 0 and not contribute to parents
    LmdGhost.decorateTree(beaconState, this);
    console.log(`[BlockchainTree] Tree redecorated after marking node invalid`);
  }
  
  /**
   * Get the LMD-GHOST HEAD (canonical chain tip)
   * Computed on-demand using LMD-GHOST fork choice algorithm
   * Returns the node directly (not just the hash)
   * 
   * GHOST-HEAD Movement:
   * - Moves when blocks are added (if new block extends heaviest chain)
   * - Moves when attestations update (if attestations shift weight to different fork)
   * 
   * Algorithm (via LmdGhost.computeGhostHead):
   * 1. Start at genesis (tree root)
   * 2. At each fork, choose child with highest attestedEth
   * 3. Continue until reaching a leaf (chain tip)
   */
  getGhostHead(beaconState?: any): BlockTreeNode | null {
    // DEBUG: Use slow version that computes attestedEth on-the-fly
    // This doesn't rely on cached metadata.attestedEth values
    if (beaconState) {
      const ghostHeadHash = LmdGhost.computeGhostHeadSlow(beaconState, this);
      return ghostHeadHash ? this.getNode(ghostHeadHash) || null : null;
    }
    
    // Fallback to fast version if no beaconState provided
    const ghostHeadHash = LmdGhost.computeGhostHead(this);
    return ghostHeadHash ? this.getNode(ghostHeadHash) || null : null;
  }
}

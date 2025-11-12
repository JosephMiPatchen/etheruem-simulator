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
    [key: string]: any;        // Allow any future metadata
  };
}

/**
 * Blockchain Tree class with Genesis Root
 * Maintains a tree of all blocks starting from a shared genesis block
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
   * Genesis block (height 0) becomes the root
   * Other blocks are added as children of their parent block
   * Returns the new tree node if successful, null if parent not found
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
    
    return newNode;
  }
  
  /**
   * Gets the canonical chain as an array of blocks (from GHOST-HEAD to genesis)
   * @param ghostHeadHash - Hash of the GHOST-HEAD (canonical chain tip from LMD-GHOST)
   */
  getCanonicalChain(ghostHeadHash?: string | null): Block[] {
    const chain: Block[] = [];
    
    // If no ghostHeadHash provided, return empty chain
    if (!ghostHeadHash) {
      return chain;
    }
    
    let current: BlockTreeNode | null | undefined = this.nodesByHash.get(ghostHeadHash);
    
    // Walk up to genesis (root)
    while (current) {
      chain.unshift(current.block);
      current = current.parent;
    }
    
    return chain;
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
   * Gets the GHOST-HEAD node (canonical chain tip from LMD-GHOST)
   * @param ghostHeadHash - Hash of the GHOST-HEAD
   */
  getCanonicalHead(ghostHeadHash?: string | null): BlockTreeNode | null {
    if (!ghostHeadHash) {
      return this.root;
    }
    
    const headNode = this.nodesByHash.get(ghostHeadHash);
    return headNode || this.root;
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
   * @param ghostHeadHash - Hash of the GHOST-HEAD for canonical chain calculation
   */
  getStats(ghostHeadHash?: string | null): {
    totalBlocks: number;
    canonicalChainLength: number;
    numberOfLeaves: number;
    numberOfForks: number;
  } {
    return {
      totalBlocks: this.nodesByHash.size,
      canonicalChainLength: this.getCanonicalChain(ghostHeadHash).length,
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
}

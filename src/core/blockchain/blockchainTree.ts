/**
 * Blockchain Tree Structure with Null Root
 * 
 * Architecture:
 * - Null root block serves as parent to all genesis blocks
 * - Multiple genesis blocks can coexist (from different nodes)
 * - HEAD pointer points to canonical chain tip (leaf node)
 * - Height = number of hops from HEAD to null root
 * - Supports GHOST fork-choice by changing HEAD pointer
 */

import { Block } from '../../types/types';

/**
 * Tree node wrapping a block with metadata
 * Extensible for future metadata (attestations, weight, etc.)
 */
export interface BlockTreeNode {
  block: Block | null;  // null for root node
  hash: string;
  parent: BlockTreeNode | null;
  children: BlockTreeNode[];
  isNullRoot: boolean;  // True only for the null root node
  
  // Metadata (extensible for future use)
  metadata: {
    weight?: number;           // For GHOST: total attestation weight
    isCanonical?: boolean;     // Is this block on the canonical chain?
    attestationCount?: number; // Number of attestations
    [key: string]: any;        // Allow any future metadata
  };
}

/**
 * Blockchain Tree class with Null Root
 * Maintains a tree of all blocks with multiple genesis blocks supported
 */
export class BlockchainTree {
  private nullRoot: BlockTreeNode;                 // Null root (parent of all genesis blocks)
  private nodesByHash: Map<string, BlockTreeNode>; // Fast lookup by hash
  private leaves: Set<BlockTreeNode>;              // All leaf nodes (chain tips)
  private head: BlockTreeNode;                     // HEAD pointer to canonical chain tip
  
  constructor() {
    // Create null root node
    this.nullRoot = {
      block: null,
      hash: 'NULL_ROOT',
      parent: null,
      children: [],
      isNullRoot: true,
      metadata: {
        isCanonical: false,
        weight: 0
      }
    };
    
    this.nodesByHash = new Map();
    this.nodesByHash.set(this.nullRoot.hash, this.nullRoot);
    
    this.leaves = new Set();
    this.head = this.nullRoot; // Initially points to null root
  }
  
  /**
   * Adds a block to the tree
   * Genesis blocks (height 0) are added as children of null root
   * Other blocks are added as children of their parent block
   * Returns the new tree node if successful, null if parent not found
   */
  addBlock(block: Block): BlockTreeNode | null {
    // Check if block already exists
    if (this.nodesByHash.has(block.hash || '')) {
      console.warn(`Block ${block.hash} already exists in tree`);
      return null;
    }
    
    // Determine parent: null root for genesis blocks, otherwise find by hash
    let parentNode: BlockTreeNode | null = null;
    
    if (block.header.height === 0) {
      // Genesis block - parent is null root
      parentNode = this.nullRoot;
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
      isNullRoot: false,
      metadata: {
        isCanonical: false,
        weight: 0
      }
    };
    
    // Add to parent's children
    parentNode.children.push(newNode);
    
    // Add to lookup map
    this.nodesByHash.set(newNode.hash, newNode);
    
    // Update leaves: remove parent if it was a leaf, add new node
    if (this.leaves.has(parentNode)) {
      this.leaves.delete(parentNode);
    }
    this.leaves.add(newNode);
    
    return newNode;
  }
  
  /**
   * Sets the HEAD pointer to a new canonical chain tip
   * Updates isCanonical metadata for all nodes on the canonical path
   */
  setHead(headHash: string): boolean {
    const headNode = this.nodesByHash.get(headHash);
    if (!headNode || headNode.isNullRoot) {
      return false;
    }
    
    // Clear all canonical flags
    this.nodesByHash.forEach(node => {
      node.metadata.isCanonical = false;
    });
    
    // Mark canonical path from head to null root
    let current: BlockTreeNode | null = headNode;
    while (current && !current.isNullRoot) {
      current.metadata.isCanonical = true;
      current = current.parent;
    }
    
    this.head = headNode;
    return true;
  }
  
  /**
   * Alias for setHead for backward compatibility
   */
  setCanonicalHead(headHash: string): boolean {
    return this.setHead(headHash);
  }
  
  /**
   * Gets the canonical chain as an array of blocks (from HEAD to genesis)
   * Excludes the null root
   */
  getCanonicalChain(): Block[] {
    const chain: Block[] = [];
    let current: BlockTreeNode | null = this.head;
    
    while (current && !current.isNullRoot) {
      if (current.block) {
        chain.unshift(current.block);
      }
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
   * Gets the HEAD node (canonical chain tip)
   */
  getCanonicalHead(): BlockTreeNode {
    return this.head;
  }
  
  /**
   * Gets the null root node
   */
  getRoot(): BlockTreeNode {
    return this.nullRoot;
  }
  
  /**
   * Gets the height of the canonical chain (hops from HEAD to null root)
   */
  getHeight(): number {
    let height = 0;
    let current: BlockTreeNode | null = this.head;
    
    while (current && !current.isNullRoot) {
      height++;
      current = current.parent;
    }
    
    return height - 1; // Subtract 1 because genesis is height 0
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
   */
  visualize(): string {
    const lines: string[] = [];
    
    const traverse = (node: BlockTreeNode, prefix: string, isLast: boolean) => {
      const marker = isLast ? '└── ' : '├── ';
      const canonical = node.metadata.isCanonical ? ' [CANONICAL]' : '';
      
      if (node.isNullRoot) {
        lines.push(`${prefix}${marker}[NULL ROOT]`);
      } else if (node.block) {
        const height = node.block.header.height;
        const shortHash = node.hash.substring(0, 8);
        lines.push(`${prefix}${marker}Block ${height} (${shortHash})${canonical}`);
      }
      
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      node.children.forEach((child, index) => {
        const isLastChild = index === node.children.length - 1;
        traverse(child, childPrefix, isLastChild);
      });
    };
    
    lines.push('[NULL ROOT]');
    this.nullRoot.children.forEach((child, index) => {
      const isLastChild = index === this.nullRoot.children.length - 1;
      traverse(child, '', isLastChild);
    });
    
    return lines.join('\n');
  }
}

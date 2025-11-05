/**
 * Blockchain Tree Structure
 * Maintains all blocks in a tree structure to support GHOST fork-choice rule
 * Keeps all branches/forks instead of discarding them
 */

import { Block } from '../../types/types';

/**
 * Tree node wrapping a block with metadata
 * Extensible for future metadata (attestations, weight, etc.)
 */
export interface BlockTreeNode {
  block: Block;
  hash: string;
  parent: BlockTreeNode | null;
  children: BlockTreeNode[];
  
  // Metadata (extensible for future use)
  metadata: {
    weight?: number;           // For GHOST: total attestation weight
    isCanonical?: boolean;     // Is this block on the canonical chain?
    attestationCount?: number; // Number of attestations
    [key: string]: any;        // Allow any future metadata
  };
}

/**
 * Blockchain Tree class
 * Maintains a tree of all blocks with the canonical chain marked
 */
export class BlockchainTree {
  private root: BlockTreeNode;                    // Genesis block
  private nodesByHash: Map<string, BlockTreeNode>; // Fast lookup by hash
  private leaves: Set<BlockTreeNode>;             // All leaf nodes (chain tips)
  private canonicalHead: BlockTreeNode;           // Current canonical chain head
  
  constructor(genesisBlock: Block) {
    // Create root node from genesis block
    this.root = {
      block: genesisBlock,
      hash: genesisBlock.hash || '',
      parent: null,
      children: [],
      metadata: {
        isCanonical: true,
        weight: 0
      }
    };
    
    this.nodesByHash = new Map();
    this.nodesByHash.set(this.root.hash, this.root);
    
    this.leaves = new Set([this.root]);
    this.canonicalHead = this.root;
  }
  
  /**
   * Adds a block to the tree
   * Returns the new tree node if successful, null if parent not found
   */
  addBlock(block: Block): BlockTreeNode | null {
    const parentHash = block.header.previousHeaderHash;
    const parentNode = this.nodesByHash.get(parentHash);
    
    if (!parentNode) {
      console.warn(`Parent block ${parentHash} not found in tree`);
      return null;
    }
    
    // Create new node
    const newNode: BlockTreeNode = {
      block,
      hash: block.hash || '',
      parent: parentNode,
      children: [],
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
   * Sets the canonical chain head
   * Updates isCanonical metadata for all nodes on the canonical path
   */
  setCanonicalHead(headHash: string): boolean {
    const headNode = this.nodesByHash.get(headHash);
    if (!headNode) {
      return false;
    }
    
    // Clear all canonical flags
    this.nodesByHash.forEach(node => {
      node.metadata.isCanonical = false;
    });
    
    // Mark canonical path from head to root
    let current: BlockTreeNode | null = headNode;
    while (current) {
      current.metadata.isCanonical = true;
      current = current.parent;
    }
    
    this.canonicalHead = headNode;
    return true;
  }
  
  /**
   * Gets the canonical chain as an array of blocks
   */
  getCanonicalChain(): Block[] {
    const chain: Block[] = [];
    let current: BlockTreeNode | null = this.canonicalHead;
    
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
   * Gets the canonical head node
   */
  getCanonicalHead(): BlockTreeNode {
    return this.canonicalHead;
  }
  
  /**
   * Gets the root (genesis) node
   */
  getRoot(): BlockTreeNode {
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
   */
  visualize(): string {
    const lines: string[] = [];
    
    const traverse = (node: BlockTreeNode, prefix: string, isLast: boolean) => {
      const marker = isLast ? '└── ' : '├── ';
      const canonical = node.metadata.isCanonical ? ' [CANONICAL]' : '';
      const height = node.block.header.height;
      const shortHash = node.hash.substring(0, 8);
      
      lines.push(`${prefix}${marker}Block ${height} (${shortHash})${canonical}`);
      
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      node.children.forEach((child, index) => {
        const isLastChild = index === node.children.length - 1;
        traverse(child, childPrefix, isLastChild);
      });
    };
    
    lines.push(`Root: Block 0 (${this.root.hash.substring(0, 8)}) [CANONICAL]`);
    this.root.children.forEach((child, index) => {
      const isLast = index === this.root.children.length - 1;
      traverse(child, '', isLast);
    });
    
    return lines.join('\n');
  }
}

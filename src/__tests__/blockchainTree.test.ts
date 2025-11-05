/**
 * Unit tests for BlockchainTree
 * Tests tree structure, fork handling, and canonical chain management
 */

import { BlockchainTree, BlockTreeNode } from '../core/blockchain/blockchainTree';
import { Block } from '../types/types';
import { createGenesisBlock } from '../core/blockchain/block';

describe('BlockchainTree', () => {
  let tree: BlockchainTree;
  let genesisBlock: Block;

  beforeEach(() => {
    genesisBlock = createGenesisBlock('test-node', 'test-address');
    tree = new BlockchainTree(genesisBlock);
  });

  describe('Initialization', () => {
    it('should initialize with genesis block as root', () => {
      const root = tree.getRoot();
      expect(root.block).toBe(genesisBlock);
      expect(root.parent).toBeNull();
      expect(root.children).toHaveLength(0);
      expect(root.metadata.isCanonical).toBe(true);
    });

    it('should have genesis as canonical head', () => {
      const head = tree.getCanonicalHead();
      expect(head.block).toBe(genesisBlock);
    });

    it('should have one leaf (genesis)', () => {
      const leaves = tree.getLeaves();
      expect(leaves).toHaveLength(1);
      expect(leaves[0].block).toBe(genesisBlock);
    });
  });

  describe('Adding Blocks', () => {
    it('should add a block to the tree', () => {
      const block1: Block = {
        header: {
          height: 1,
          timestamp: Date.now(),
          previousHeaderHash: genesisBlock.hash || '',
          nonce: 0
        },
        transactions: [],
        hash: 'block1hash'
      };

      const node = tree.addBlock(block1);
      expect(node).not.toBeNull();
      expect(node?.block).toBe(block1);
      expect(node?.parent?.block).toBe(genesisBlock);
    });

    it('should reject block with unknown parent', () => {
      const block1: Block = {
        header: {
          height: 1,
          timestamp: Date.now(),
          previousHeaderHash: 'unknown-hash',
          nonce: 0
        },
        transactions: [],
        hash: 'block1hash'
      };

      const node = tree.addBlock(block1);
      expect(node).toBeNull();
    });

    it('should update leaves when adding blocks', () => {
      const block1: Block = {
        header: {
          height: 1,
          timestamp: Date.now(),
          previousHeaderHash: genesisBlock.hash || '',
          nonce: 0
        },
        transactions: [],
        hash: 'block1hash'
      };

      tree.addBlock(block1);
      const leaves = tree.getLeaves();
      expect(leaves).toHaveLength(1);
      expect(leaves[0].block).toBe(block1);
    });
  });

  describe('Fork Handling', () => {
    it('should handle a simple fork', () => {
      const block1a: Block = {
        header: {
          height: 1,
          timestamp: Date.now(),
          previousHeaderHash: genesisBlock.hash || '',
          nonce: 0
        },
        transactions: [],
        hash: 'block1a'
      };

      const block1b: Block = {
        header: {
          height: 1,
          timestamp: Date.now(),
          previousHeaderHash: genesisBlock.hash || '',
          nonce: 1
        },
        transactions: [],
        hash: 'block1b'
      };

      tree.addBlock(block1a);
      tree.addBlock(block1b);

      const root = tree.getRoot();
      expect(root.children).toHaveLength(2);

      const leaves = tree.getLeaves();
      expect(leaves).toHaveLength(2);
    });

    it('should maintain multiple branches', () => {
      // Create a fork at height 1
      const block1a: Block = {
        header: { height: 1, timestamp: Date.now(), previousHeaderHash: genesisBlock.hash || '', nonce: 0 },
        transactions: [],
        hash: 'block1a'
      };

      const block1b: Block = {
        header: { height: 1, timestamp: Date.now(), previousHeaderHash: genesisBlock.hash || '', nonce: 1 },
        transactions: [],
        hash: 'block1b'
      };

      tree.addBlock(block1a);
      tree.addBlock(block1b);

      // Extend branch A
      const block2a: Block = {
        header: { height: 2, timestamp: Date.now(), previousHeaderHash: 'block1a', nonce: 0 },
        transactions: [],
        hash: 'block2a'
      };

      tree.addBlock(block2a);

      const stats = tree.getStats();
      expect(stats.totalBlocks).toBe(4); // genesis + 1a + 1b + 2a
      expect(stats.numberOfLeaves).toBe(2); // 1b and 2a
      expect(stats.numberOfForks).toBe(1);
    });
  });

  describe('Canonical Chain Management', () => {
    it('should set canonical head', () => {
      const block1: Block = {
        header: { height: 1, timestamp: Date.now(), previousHeaderHash: genesisBlock.hash || '', nonce: 0 },
        transactions: [],
        hash: 'block1hash'
      };

      const node = tree.addBlock(block1);
      tree.setCanonicalHead('block1hash');

      const head = tree.getCanonicalHead();
      expect(head.block).toBe(block1);
      expect(head.metadata.isCanonical).toBe(true);
    });

    it('should mark canonical path from head to root', () => {
      const block1: Block = {
        header: { height: 1, timestamp: Date.now(), previousHeaderHash: genesisBlock.hash || '', nonce: 0 },
        transactions: [],
        hash: 'block1hash'
      };

      const block2: Block = {
        header: { height: 2, timestamp: Date.now(), previousHeaderHash: 'block1hash', nonce: 0 },
        transactions: [],
        hash: 'block2hash'
      };

      tree.addBlock(block1);
      tree.addBlock(block2);
      tree.setCanonicalHead('block2hash');

      const node1 = tree.getNode('block1hash');
      const node2 = tree.getNode('block2hash');
      const root = tree.getRoot();

      expect(root.metadata.isCanonical).toBe(true);
      expect(node1?.metadata.isCanonical).toBe(true);
      expect(node2?.metadata.isCanonical).toBe(true);
    });

    it('should clear old canonical flags when switching chains', () => {
      // Create two branches
      const block1a: Block = {
        header: { height: 1, timestamp: Date.now(), previousHeaderHash: genesisBlock.hash || '', nonce: 0 },
        transactions: [],
        hash: 'block1a'
      };

      const block1b: Block = {
        header: { height: 1, timestamp: Date.now(), previousHeaderHash: genesisBlock.hash || '', nonce: 1 },
        transactions: [],
        hash: 'block1b'
      };

      tree.addBlock(block1a);
      tree.addBlock(block1b);

      // Set 1a as canonical
      tree.setCanonicalHead('block1a');
      expect(tree.getNode('block1a')?.metadata.isCanonical).toBe(true);
      expect(tree.getNode('block1b')?.metadata.isCanonical).toBe(false);

      // Switch to 1b
      tree.setCanonicalHead('block1b');
      expect(tree.getNode('block1a')?.metadata.isCanonical).toBe(false);
      expect(tree.getNode('block1b')?.metadata.isCanonical).toBe(true);
    });

    it('should get canonical chain as array', () => {
      const block1: Block = {
        header: { height: 1, timestamp: Date.now(), previousHeaderHash: genesisBlock.hash || '', nonce: 0 },
        transactions: [],
        hash: 'block1hash'
      };

      const block2: Block = {
        header: { height: 2, timestamp: Date.now(), previousHeaderHash: 'block1hash', nonce: 0 },
        transactions: [],
        hash: 'block2hash'
      };

      tree.addBlock(block1);
      tree.addBlock(block2);
      tree.setCanonicalHead('block2hash');

      const chain = tree.getCanonicalChain();
      expect(chain).toHaveLength(3);
      expect(chain[0]).toBe(genesisBlock);
      expect(chain[1]).toBe(block1);
      expect(chain[2]).toBe(block2);
    });
  });

  describe('Tree Statistics', () => {
    it('should calculate correct statistics', () => {
      const block1: Block = {
        header: { height: 1, timestamp: Date.now(), previousHeaderHash: genesisBlock.hash || '', nonce: 0 },
        transactions: [],
        hash: 'block1hash'
      };

      tree.addBlock(block1);
      tree.setCanonicalHead('block1hash');

      const stats = tree.getStats();
      expect(stats.totalBlocks).toBe(2);
      expect(stats.canonicalChainLength).toBe(2);
      expect(stats.numberOfLeaves).toBe(1);
      expect(stats.numberOfForks).toBe(0);
    });
  });

  describe('Metadata Extensibility', () => {
    it('should allow custom metadata', () => {
      const block1: Block = {
        header: { height: 1, timestamp: Date.now(), previousHeaderHash: genesisBlock.hash || '', nonce: 0 },
        transactions: [],
        hash: 'block1hash'
      };

      const node = tree.addBlock(block1);
      
      // Add custom metadata
      if (node) {
        node.metadata.weight = 100;
        node.metadata.attestationCount = 5;
        node.metadata.customField = 'custom value';
      }

      const retrievedNode = tree.getNode('block1hash');
      expect(retrievedNode?.metadata.weight).toBe(100);
      expect(retrievedNode?.metadata.attestationCount).toBe(5);
      expect(retrievedNode?.metadata.customField).toBe('custom value');
    });
  });
});

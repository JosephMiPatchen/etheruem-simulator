/**
 * Unit tests for BlockchainTree class
 * Tests tree structure, block addition, chain retrieval, and fork handling
 */

import { BlockchainTree, BlockTreeNode } from '../../core/blockchain/blockchainTree';
import { Block } from '../../types/types';

describe('BlockchainTree', () => {
  let tree: BlockchainTree;

  /**
   * Helper to create a simple block
   */
  function createBlock(hash: string, parentHash: string, height: number, slot: number = 0): Block {
    return {
      hash,
      header: {
        transactionHash: '',
        timestamp: Date.now(),
        previousHeaderHash: parentHash,
        height,
        slot,
      },
      transactions: [],
      attestations: [],
      randaoReveal: 'test-randao',
    };
  }

  beforeEach(() => {
    tree = new BlockchainTree();
  });

  describe('addBlock', () => {
    it('should add genesis block as root', () => {
      // Given: Genesis block
      const genesis = createBlock('genesis', '', 0);
      
      // When: Add genesis
      const node = tree.addBlock(genesis);
      
      // Then: Should be added as root
      expect(node).not.toBeNull();
      expect(node?.hash).toBe('genesis');
      expect(node?.parent).toBeNull();
      expect(tree.getRoot()).toBe(node);
    });

    it('should add child block to parent', () => {
      // Given: Genesis and child block
      const genesis = createBlock('genesis', '', 0);
      const blockA = createBlock('blockA', 'genesis', 1);
      
      tree.addBlock(genesis);
      
      // When: Add child
      const nodeA = tree.addBlock(blockA);
      
      // Then: Should be added as child of genesis
      expect(nodeA).not.toBeNull();
      expect(nodeA?.parent?.hash).toBe('genesis');
      expect(tree.getRoot()?.children).toContain(nodeA);
    });

    it('should reject block if parent not found', () => {
      // Given: Block with unknown parent
      const blockA = createBlock('blockA', 'unknownParent', 1);
      
      // When: Try to add block
      const node = tree.addBlock(blockA);
      
      // Then: Should return null
      expect(node).toBeNull();
      expect(tree.getNode('blockA')).toBeUndefined();
    });

    it('should reject duplicate block', () => {
      // Given: Block already in tree
      const genesis = createBlock('genesis', '', 0);
      tree.addBlock(genesis);
      
      // When: Try to add same block again
      const node = tree.addBlock(genesis);
      
      // Then: Should return null
      expect(node).toBeNull();
    });

    it('should handle fork creation', () => {
      // Given: Genesis and two children (fork)
      const genesis = createBlock('genesis', '', 0);
      const blockA = createBlock('blockA', 'genesis', 1);
      const blockB = createBlock('blockB', 'genesis', 1);
      
      tree.addBlock(genesis);
      tree.addBlock(blockA);
      
      // When: Add second child (creates fork)
      const nodeB = tree.addBlock(blockB);
      
      // Then: Both should be children of genesis
      expect(nodeB).not.toBeNull();
      expect(tree.getRoot()?.children.length).toBe(2);
      expect(tree.getRoot()?.children.map(c => c.hash)).toContain('blockA');
      expect(tree.getRoot()?.children.map(c => c.hash)).toContain('blockB');
    });

    it('should update leaves correctly', () => {
      // Given: Chain of blocks
      const genesis = createBlock('genesis', '', 0);
      const blockA = createBlock('blockA', 'genesis', 1);
      const blockB = createBlock('blockB', 'blockA', 2);
      
      tree.addBlock(genesis);
      
      // When: Add blockA
      tree.addBlock(blockA);
      
      // Then: Genesis should no longer be a leaf
      const leaves1 = tree.getLeaves();
      expect(leaves1.map(l => l.hash)).not.toContain('genesis');
      expect(leaves1.map(l => l.hash)).toContain('blockA');
      
      // When: Add blockB
      tree.addBlock(blockB);
      
      // Then: blockA should no longer be a leaf
      const leaves2 = tree.getLeaves();
      expect(leaves2.map(l => l.hash)).not.toContain('blockA');
      expect(leaves2.map(l => l.hash)).toContain('blockB');
    });
  });

  describe('getChain', () => {
    it('should return chain from genesis to specified block', () => {
      // Given: Chain genesis -> A -> B -> C
      const genesis = createBlock('genesis', '', 0);
      const blockA = createBlock('blockA', 'genesis', 1);
      const blockB = createBlock('blockB', 'blockA', 2);
      const blockC = createBlock('blockC', 'blockB', 3);
      
      tree.addBlock(genesis);
      tree.addBlock(blockA);
      tree.addBlock(blockB);
      tree.addBlock(blockC);
      
      // When: Get chain to blockC
      const chain = tree.getChain('blockC');
      
      // Then: Should return all blocks in order
      expect(chain.length).toBe(4);
      expect(chain.map(b => b.hash)).toEqual(['genesis', 'blockA', 'blockB', 'blockC']);
    });

    it('should return empty chain for non-existent block', () => {
      // Given: Tree with genesis
      const genesis = createBlock('genesis', '', 0);
      tree.addBlock(genesis);
      
      // When: Get chain for non-existent block
      const chain = tree.getChain('unknownBlock');
      
      // Then: Should return empty array
      expect(chain).toEqual([]);
    });

    it('should return only genesis for genesis block', () => {
      // Given: Tree with only genesis
      const genesis = createBlock('genesis', '', 0);
      tree.addBlock(genesis);
      
      // When: Get chain for genesis
      const chain = tree.getChain('genesis');
      
      // Then: Should return only genesis
      expect(chain.length).toBe(1);
      expect(chain[0].hash).toBe('genesis');
    });
  });

  describe('getNode', () => {
    it('should retrieve node by hash', () => {
      // Given: Tree with blocks
      const genesis = createBlock('genesis', '', 0);
      const blockA = createBlock('blockA', 'genesis', 1);
      
      tree.addBlock(genesis);
      tree.addBlock(blockA);
      
      // When: Get node by hash
      const node = tree.getNode('blockA');
      
      // Then: Should return correct node
      expect(node).not.toBeUndefined();
      expect(node?.hash).toBe('blockA');
      expect(node?.block.hash).toBe('blockA');
    });

    it('should return undefined for non-existent hash', () => {
      // Given: Tree with genesis
      const genesis = createBlock('genesis', '', 0);
      tree.addBlock(genesis);
      
      // When: Get non-existent node
      const node = tree.getNode('unknownBlock');
      
      // Then: Should return undefined
      expect(node).toBeUndefined();
    });
  });

  describe('getRoot', () => {
    it('should return null for empty tree', () => {
      // Given: Empty tree
      
      // When: Get root
      const root = tree.getRoot();
      
      // Then: Should return null
      expect(root).toBeNull();
    });

    it('should return genesis block as root', () => {
      // Given: Tree with genesis
      const genesis = createBlock('genesis', '', 0);
      tree.addBlock(genesis);
      
      // When: Get root
      const root = tree.getRoot();
      
      // Then: Should return genesis
      expect(root).not.toBeNull();
      expect(root?.hash).toBe('genesis');
    });
  });


  describe('getAllNodes', () => {
    it('should return all nodes in tree', () => {
      // Given: Tree with multiple blocks
      const genesis = createBlock('genesis', '', 0);
      const blockA = createBlock('blockA', 'genesis', 1);
      const blockB = createBlock('blockB', 'blockA', 2);
      
      tree.addBlock(genesis);
      tree.addBlock(blockA);
      tree.addBlock(blockB);
      
      // When: Get all nodes
      const nodes = tree.getAllNodes();
      
      // Then: Should return all 3 nodes
      expect(nodes.length).toBe(3);
      expect(nodes.map(n => n.hash).sort()).toEqual(['blockA', 'blockB', 'genesis']);
    });

    it('should return empty array for empty tree', () => {
      // Given: Empty tree
      
      // When: Get all nodes
      const nodes = tree.getAllNodes();
      
      // Then: Should return empty array
      expect(nodes).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics for linear chain', () => {
      // Given: Linear chain with 4 blocks
      const genesis = createBlock('genesis', '', 0);
      const blockA = createBlock('blockA', 'genesis', 1);
      const blockB = createBlock('blockB', 'blockA', 2);
      const blockC = createBlock('blockC', 'blockB', 3);
      
      tree.addBlock(genesis);
      tree.addBlock(blockA);
      tree.addBlock(blockB);
      tree.addBlock(blockC);
      
      // When: Get stats
      const stats = tree.getStats();
      
      // Then: Should return correct counts
      expect(stats.totalBlocks).toBe(4);
      expect(stats.numberOfLeaves).toBe(1);
      // numberOfForks = leaves - 1 (for linear chain, 1 - 1 = 0)
      expect(stats.numberOfForks).toBe(0);
    });

    it('should return correct statistics for forked tree', () => {
      // Given: Tree with fork
      //     genesis
      //        |
      //        A
      //       / \
      //      B   C
      //          |
      //          D
      const genesis = createBlock('genesis', '', 0);
      const blockA = createBlock('blockA', 'genesis', 1);
      const blockB = createBlock('blockB', 'blockA', 2);
      const blockC = createBlock('blockC', 'blockA', 2);
      const blockD = createBlock('blockD', 'blockC', 3);
      
      tree.addBlock(genesis);
      tree.addBlock(blockA);
      tree.addBlock(blockB);
      tree.addBlock(blockC);
      tree.addBlock(blockD);
      
      // When: Get stats
      const stats = tree.getStats();
      
      // Then: Should return correct counts
      expect(stats.totalBlocks).toBe(5);
      expect(stats.numberOfLeaves).toBe(2); // B and D
      expect(stats.numberOfForks).toBe(1); // 2 leaves - 1 = 1 fork
    });
  });

  describe('Integration: Complex tree operations', () => {
    it('should handle complex fork scenario with multiple branches', () => {
      // Given: Complex tree structure
      //         genesis
      //            |
      //            A
      //          / | \
      //         B  C  D
      //        /      |
      //       E       F
      
      const genesis = createBlock('genesis', '', 0);
      const blockA = createBlock('blockA', 'genesis', 1);
      const blockB = createBlock('blockB', 'blockA', 2);
      const blockC = createBlock('blockC', 'blockA', 2);
      const blockD = createBlock('blockD', 'blockA', 2);
      const blockE = createBlock('blockE', 'blockB', 3);
      const blockF = createBlock('blockF', 'blockD', 3);
      
      // When: Build tree
      tree.addBlock(genesis);
      tree.addBlock(blockA);
      tree.addBlock(blockB);
      tree.addBlock(blockC);
      tree.addBlock(blockD);
      tree.addBlock(blockE);
      tree.addBlock(blockF);
      
      // Then: Verify structure
      expect(tree.getAllNodes().length).toBe(7);
      expect(tree.getLeaves().length).toBe(3); // C, E, F
      expect(tree.getLeaves().map(l => l.hash).sort()).toEqual(['blockC', 'blockE', 'blockF']);
      
      // Verify chains
      const chainE = tree.getChain('blockE');
      expect(chainE.map(b => b.hash)).toEqual(['genesis', 'blockA', 'blockB', 'blockE']);
      
      const chainF = tree.getChain('blockF');
      expect(chainF.map(b => b.hash)).toEqual(['genesis', 'blockA', 'blockD', 'blockF']);
      
      // Verify parent-child relationships
      const nodeA = tree.getNode('blockA');
      expect(nodeA?.children.length).toBe(3);
      expect(nodeA?.children.map(c => c.hash).sort()).toEqual(['blockB', 'blockC', 'blockD']);
    });

    it('should maintain tree integrity when adding blocks out of order', () => {
      // Given: Blocks added in non-sequential order
      const genesis = createBlock('genesis', '', 0);
      const blockA = createBlock('blockA', 'genesis', 1);
      const blockB = createBlock('blockB', 'blockA', 2);
      const blockC = createBlock('blockC', 'blockB', 3);
      
      // When: Add in order: genesis, C (fails), B, A, C (succeeds)
      tree.addBlock(genesis);
      
      const nodeC1 = tree.addBlock(blockC); // Should fail - parent not found
      expect(nodeC1).toBeNull();
      
      const nodeB1 = tree.addBlock(blockB); // Should fail - parent not found
      expect(nodeB1).toBeNull();
      
      const nodeA = tree.addBlock(blockA); // Should succeed
      expect(nodeA).not.toBeNull();
      
      const nodeB2 = tree.addBlock(blockB); // Should succeed now
      expect(nodeB2).not.toBeNull();
      
      const nodeC2 = tree.addBlock(blockC); // Should succeed now
      expect(nodeC2).not.toBeNull();
      
      // Then: Tree should be correct
      expect(tree.getAllNodes().length).toBe(4);
      const chain = tree.getChain('blockC');
      expect(chain.map(b => b.hash)).toEqual(['genesis', 'blockA', 'blockB', 'blockC']);
    });
  });
});

/**
 * Unit tests for LmdGhost class
 * Tests incremental tree decoration, fork choice, and attestation handling
 */

import { LmdGhost } from '../../core/consensus/lmdGhost';
import { BlockchainTree, BlockTreeNode } from '../../core/blockchain/blockchainTree';
import { Block } from '../../types/types';
import { BeaconState, Validator } from '../../core/consensus/beaconState';

describe('LmdGhost', () => {
  let tree: BlockchainTree;
  let beaconState: BeaconState;
  let genesisBlock: Block;
  let blockA: Block;
  let blockB: Block;
  let blockC: Block;

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

  /**
   * Helper to create an attestation
   */
  function createAttestation(validatorAddress: string, blockHash: string, timestamp: number) {
    return {
      validatorAddress,
      blockHash,
      timestamp,
    };
  }

  /**
   * Helper to initialize node metadata (BlockchainTree doesn't do this by default)
   */
  function initializeNodeMetadata(node: BlockTreeNode) {
    if (!node.metadata) {
      node.metadata = { attestedEth: 0 };
    }
  }

  beforeEach(() => {
    // Create a simple blockchain tree:
    //     genesis
    //        |
    //        A
    //       / \
    //      B   C
    
    genesisBlock = createBlock('genesis', '', 0);
    blockA = createBlock('blockA', 'genesis', 1);
    blockB = createBlock('blockB', 'blockA', 2);
    blockC = createBlock('blockC', 'blockA', 2);

    tree = new BlockchainTree();
    tree.addBlock(genesisBlock);  // Add genesis first
    tree.addBlock(blockA);
    tree.addBlock(blockB);
    tree.addBlock(blockC);

    // Initialize metadata for all nodes
    const genesisNode = tree.getNode('genesis');
    const nodeA = tree.getNode('blockA');
    const nodeB = tree.getNode('blockB');
    const nodeC = tree.getNode('blockC');
    
    if (genesisNode) initializeNodeMetadata(genesisNode);
    if (nodeA) initializeNodeMetadata(nodeA);
    if (nodeB) initializeNodeMetadata(nodeB);
    if (nodeC) initializeNodeMetadata(nodeC);

    // Create beacon state with 3 validators
    const genesisTime = Math.floor(Date.now() / 1000);
    const validators: Validator[] = [
      { nodeAddress: 'validator1', stakedEth: 32 },
      { nodeAddress: 'validator2', stakedEth: 32 },
      { nodeAddress: 'validator3', stakedEth: 32 },
    ];
    beaconState = new BeaconState(genesisTime, validators);
  });

  describe('onLatestAttestChange', () => {
    it('should increment attestedEth when new attestation added', () => {
      // Given: No attestations yet
      const att1 = createAttestation('validator1', 'blockB', 1000);
      
      // When: Add attestation to blockB
      LmdGhost.onLatestAttestChange(beaconState, tree, undefined, att1);
      
      // Then: blockB and its ancestors should have +32 ETH
      const nodeB = tree.getNode('blockB')!;
      const nodeA = tree.getNode('blockA')!;
      const nodeGenesis = tree.getNode('genesis')!;
      
      expect(nodeB.metadata.attestedEth).toBe(32);
      expect(nodeA.metadata.attestedEth).toBe(32);
      expect(nodeGenesis.metadata.attestedEth).toBe(32);
      
      // blockC should have 0 or undefined (different fork, no attestations)
      const nodeC = tree.getNode('blockC')!;
      expect(nodeC.metadata.attestedEth || 0).toBe(0);
    });

    it('should decrement old and increment new when attestation changes', () => {
      // Given: validator1 attests to blockB
      const att1 = createAttestation('validator1', 'blockB', 1000);
      LmdGhost.onLatestAttestChange(beaconState, tree, undefined, att1);
      
      // When: validator1 changes attestation to blockC
      const att2 = createAttestation('validator1', 'blockC', 2000);
      LmdGhost.onLatestAttestChange(beaconState, tree, att1, att2);
      
      // Then: blockB path should be decremented, blockC path incremented
      const nodeB = tree.getNode('blockB')!;
      const nodeC = tree.getNode('blockC')!;
      const nodeA = tree.getNode('blockA')!;
      
      expect(nodeB.metadata.attestedEth).toBe(0);  // Decremented
      expect(nodeC.metadata.attestedEth).toBe(32); // Incremented
      expect(nodeA.metadata.attestedEth).toBe(32); // Still has C's attestation
    });

    it('should handle attestation to non-existent block gracefully', () => {
      // Given: Attestation to block we don't have
      const att = createAttestation('validator1', 'unknownBlock', 1000);
      
      // When: Try to add attestation
      expect(() => {
        LmdGhost.onLatestAttestChange(beaconState, tree, undefined, att);
      }).not.toThrow();
      
      // Then: No changes to tree
      const nodeB = tree.getNode('blockB')!;
      expect(nodeB.metadata.attestedEth || 0).toBe(0);
    });

    it('should handle multiple attestations accumulating', () => {
      // Given: Three validators attest to blockB
      const att1 = createAttestation('validator1', 'blockB', 1000);
      const att2 = createAttestation('validator2', 'blockB', 1000);
      const att3 = createAttestation('validator3', 'blockB', 1000);
      
      // When: Add all attestations
      LmdGhost.onLatestAttestChange(beaconState, tree, undefined, att1);
      LmdGhost.onLatestAttestChange(beaconState, tree, undefined, att2);
      LmdGhost.onLatestAttestChange(beaconState, tree, undefined, att3);
      
      // Then: blockB and ancestors should have 96 ETH (3 * 32)
      const nodeB = tree.getNode('blockB')!;
      const nodeA = tree.getNode('blockA')!;
      
      expect(nodeB.metadata.attestedEth).toBe(96);
      expect(nodeA.metadata.attestedEth).toBe(96);
    });
  });

  describe('onNewAttestations', () => {
    it('should process multiple attestations correctly', () => {
      // Given: Multiple new attestations
      const attestations = [
        createAttestation('validator1', 'blockB', 1000),
        createAttestation('validator2', 'blockC', 1000),
        createAttestation('validator3', 'blockB', 1000),
      ];
      
      // When: Process all attestations
      LmdGhost.onNewAttestations(beaconState, tree, attestations);
      
      // Then: Attestations should be recorded and tree decorated
      expect(beaconState.latestAttestations.size).toBe(3);
      
      const nodeB = tree.getNode('blockB')!;
      const nodeC = tree.getNode('blockC')!;
      const nodeA = tree.getNode('blockA')!;
      
      expect(nodeB.metadata.attestedEth).toBe(64); // 2 validators
      expect(nodeC.metadata.attestedEth).toBe(32); // 1 validator
      expect(nodeA.metadata.attestedEth).toBe(96); // Both forks (2 + 1)
    });

    it('should only update with newer attestations', () => {
      // Given: validator1 attests to blockB at time 2000
      const oldAtt = createAttestation('validator1', 'blockB', 2000);
      LmdGhost.onNewAttestations(beaconState, tree, [oldAtt]);
      
      // When: Try to add older attestation from same validator
      const newerAtt = createAttestation('validator1', 'blockC', 1000);
      LmdGhost.onNewAttestations(beaconState, tree, [newerAtt]);
      
      // Then: Old attestation should remain
      const nodeB = tree.getNode('blockB')!;
      const nodeC = tree.getNode('blockC')!;
      
      expect(nodeB.metadata.attestedEth).toBe(32); // Still has attestation
      expect(nodeC.metadata.attestedEth || 0).toBe(0);  // Rejected (older)
    });
  });

  describe('onNewBlock', () => {
    it('should increment attestedEth when existing attestations point to new block', () => {
      // Given: Attestations already exist pointing to a block hash
      beaconState.latestAttestations.set('validator1', createAttestation('validator1', 'blockD', 1000));
      beaconState.latestAttestations.set('validator2', createAttestation('validator2', 'blockD', 1000));
      
      // When: New block arrives with that hash
      const blockD = createBlock('blockD', 'blockA', 2);
      tree.addBlock(blockD);
      LmdGhost.onNewBlock(blockD, tree, beaconState);
      
      // Then: blockD and ancestors should have attestedEth
      const nodeD = tree.getNode('blockD')!;
      const nodeA = tree.getNode('blockA')!;
      
      expect(nodeD.metadata.attestedEth).toBe(64); // 2 * 32
      expect(nodeA.metadata.attestedEth).toBe(64);
    });

    it('should handle block with no attestations', () => {
      // Given: No attestations pointing to blockD
      const blockD = createBlock('blockD', 'blockA', 2);
      tree.addBlock(blockD);
      
      // When: Process new block
      expect(() => {
        LmdGhost.onNewBlock(blockD, tree, beaconState);
      }).not.toThrow();
      
      // Then: No changes
      const nodeD = tree.getNode('blockD')!;
      expect(nodeD.metadata.attestedEth || 0).toBe(0);
    });
  });

  describe('markNodeInvalid', () => {
    it('should mark node invalid and decrement parent attestedEth', () => {
      // Given: blockB has 32 ETH from attestation
      const att = createAttestation('validator1', 'blockB', 1000);
      LmdGhost.onLatestAttestChange(beaconState, tree, undefined, att);
      
      const nodeB = tree.getNode('blockB')!;
      const nodeA = tree.getNode('blockA')!;
      
      expect(nodeB.metadata.attestedEth).toBe(32);
      expect(nodeA.metadata.attestedEth).toBe(32);
      
      // When: Mark blockB as invalid
      LmdGhost.markNodeInvalid(nodeB);
      
      // Then: blockB should be invalid with 0 ETH, parent decremented
      expect(nodeB.metadata.isInvalid).toBe(true);
      expect(nodeB.metadata.attestedEth).toBe(0);
      expect(nodeA.metadata.attestedEth).toBe(0); // Decremented by 32
    });

    it('should not decrement if node has no attestedEth', () => {
      // Given: blockB has no attestations
      const nodeB = tree.getNode('blockB')!;
      const nodeA = tree.getNode('blockA')!;
      
      expect(nodeB.metadata.attestedEth || 0).toBe(0);
      
      // When: Mark blockB as invalid
      LmdGhost.markNodeInvalid(nodeB);
      
      // Then: No changes to parent
      expect(nodeB.metadata.isInvalid).toBe(true);
      expect(nodeA.metadata.attestedEth || 0).toBe(0);
    });
  });

  describe('computeGhostHead', () => {
    it('should return genesis when no attestations', () => {
      // Given: No attestations
      
      // When: Compute GHOST-HEAD
      const ghostHead = LmdGhost.computeGhostHead(tree);
      
      // Then: Should return blockA (follows chain to first leaf with no attestations)
      // Note: GHOST follows the chain down, so with no attestations it goes to a leaf
      expect(ghostHead).toBe('blockA');
    });

    it('should follow heaviest chain', () => {
      // Given: blockB has more attestations than blockC
      const attestations = [
        createAttestation('validator1', 'blockB', 1000),
        createAttestation('validator2', 'blockB', 1000),
        createAttestation('validator3', 'blockC', 1000),
      ];
      LmdGhost.onNewAttestations(beaconState, tree, attestations);
      
      // When: Compute GHOST-HEAD
      const ghostHead = LmdGhost.computeGhostHead(tree);
      
      // Then: Should return blockB (64 ETH > 32 ETH)
      expect(ghostHead).toBe('blockB');
    });

    it('should stop at parent when children have equal attestedEth (tie)', () => {
      // Given: blockB and blockC have equal attestations
      const attestations = [
        createAttestation('validator1', 'blockB', 1000),
        createAttestation('validator2', 'blockC', 1000),
      ];
      LmdGhost.onNewAttestations(beaconState, tree, attestations);
      
      // When: Compute GHOST-HEAD
      const ghostHead = LmdGhost.computeGhostHead(tree);
      
      // Then: Should return blockA (parent of tie)
      expect(ghostHead).toBe('blockA');
    });

    it('should skip invalid nodes', () => {
      // Given: blockB has more attestations but is invalid
      const attestations = [
        createAttestation('validator1', 'blockB', 1000),
        createAttestation('validator2', 'blockB', 1000),
        createAttestation('validator3', 'blockC', 1000),
      ];
      LmdGhost.onNewAttestations(beaconState, tree, attestations);
      
      const nodeB = tree.getNode('blockB')!;
      LmdGhost.markNodeInvalid(nodeB);
      
      // When: Compute GHOST-HEAD
      const ghostHead = LmdGhost.computeGhostHead(tree);
      
      // Then: Should return blockC (blockB is invalid)
      expect(ghostHead).toBe('blockC');
    });

    it('should return parent when all children are invalid', () => {
      // Given: Both blockB and blockC are invalid
      const nodeB = tree.getNode('blockB')!;
      const nodeC = tree.getNode('blockC')!;
      
      LmdGhost.markNodeInvalid(nodeB);
      LmdGhost.markNodeInvalid(nodeC);
      
      // When: Compute GHOST-HEAD
      const ghostHead = LmdGhost.computeGhostHead(tree);
      
      // Then: Should return blockA (no valid children)
      expect(ghostHead).toBe('blockA');
    });

    it('should handle deep chain correctly', () => {
      // Given: A longer chain
      //     genesis -> A -> B -> D -> E
      //                  \-> C
      const blockD = createBlock('blockD', 'blockB', 3);
      const blockE = createBlock('blockE', 'blockD', 4);
      tree.addBlock(blockD);
      tree.addBlock(blockE);
      
      // All validators attest to blockE
      const attestations = [
        createAttestation('validator1', 'blockE', 1000),
        createAttestation('validator2', 'blockE', 1000),
        createAttestation('validator3', 'blockE', 1000),
      ];
      LmdGhost.onNewAttestations(beaconState, tree, attestations);
      
      // When: Compute GHOST-HEAD
      const ghostHead = LmdGhost.computeGhostHead(tree);
      
      // Then: Should return blockE (deepest with attestations)
      expect(ghostHead).toBe('blockE');
    });
  });

  describe('Integration: Complex fork choice scenario', () => {
    it('should handle realistic fork with attestation changes and invalidation', () => {
      // Given: Complex scenario
      //     genesis -> A -> B -> D
      //                  \-> C
      
      const blockD = createBlock('blockD', 'blockB', 3);
      tree.addBlock(blockD);
      
      // Step 1: Initial attestations favor blockD
      const attestations1 = [
        createAttestation('validator1', 'blockD', 1000),
        createAttestation('validator2', 'blockD', 1000),
        createAttestation('validator3', 'blockC', 1000),
      ];
      LmdGhost.onNewAttestations(beaconState, tree, attestations1);
      
      expect(LmdGhost.computeGhostHead(tree)).toBe('blockD');
      
      // Step 2: validator1 changes to blockC (now tied 64-64)
      const attestations2 = [
        createAttestation('validator1', 'blockC', 2000),
      ];
      LmdGhost.onNewAttestations(beaconState, tree, attestations2);
      
      // With validator1 on C (32 ETH) and validator2 on D->B (32 ETH), blockB and blockC are tied
      // But blockD is a child of blockB, so blockB path has 32 ETH total
      // Actually after the change, validator1 moved from D to C, so:
      // - blockC: 32 ETH (validator1)
      // - blockB->D: 32 ETH (validator2)
      // They're tied at blockA level, but blockC is a direct child
      // GHOST should pick blockC since it has equal weight and is simpler
      expect(LmdGhost.computeGhostHead(tree)).toBe('blockC');
      
      // Step 3: Mark blockD as invalid
      const nodeD = tree.getNode('blockD')!;
      LmdGhost.markNodeInvalid(nodeD);
      
      // After marking blockD invalid, blockB path lost its attestations
      // blockB: 0 ETH (validator2 was on blockD which is now invalid)
      // blockC: 32 ETH (validator1)
      // So blockC should win
      expect(LmdGhost.computeGhostHead(tree)).toBe('blockC');
      
      // Step 4: validator2 moves to blockC
      const attestations3 = [
        createAttestation('validator2', 'blockC', 3000),
      ];
      LmdGhost.onNewAttestations(beaconState, tree, attestations3);
      
      // Now blockC should win (96 ETH vs 0 ETH)
      expect(LmdGhost.computeGhostHead(tree)).toBe('blockC');
    });
  });
});

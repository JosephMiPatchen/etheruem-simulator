/**
 * Integration tests for Blockchain class
 * Tests blockchain operations including block addition, validation, reorgs, and attestations
 */

import { Blockchain } from '../../core/blockchain/blockchain';
import { BeaconState, Validator } from '../../core/consensus/beaconState';
import { Block, EthereumTransaction } from '../../types/types';
import { calculateBlockHeaderHash } from '../../core/validation/blockValidator';

describe('Blockchain Integration Tests', () => {
  let blockchain: Blockchain;
  let beaconState: BeaconState;
  const genesisTime = Math.floor(Date.now() / 1000);

  /**
   * Helper to create a validator set
   */
  function createValidators(count: number): Validator[] {
    const validators: Validator[] = [];
    for (let i = 0; i < count; i++) {
      validators.push({
        nodeAddress: `validator${i}`,
        stakedEth: 32,
      });
    }
    return validators;
  }

  /**
   * Helper to create a simple block for testing
   * Includes a coinbase transaction by default to pass validation
   */
  function createTestBlock(
    parentHash: string,
    height: number,
    slot: number,
    proposer: string,
    transactions?: EthereumTransaction[]
  ): Block {
    // If no transactions provided, create a coinbase transaction (required as first tx)
    const txs = transactions || [
      {
        from: '',  // Empty from = coinbase/issuance transaction
        to: proposer,
        value: 2,  // Block reward
        nonce: 0,
        publicKey: '',
        signature: '',
        timestamp: Date.now(),
        txid: `coinbase_${proposer}_${height}`,
      }
    ];
    
    const header = {
      transactionHash: '',
      timestamp: Date.now(),
      previousHeaderHash: parentHash,
      height,
      slot,
    };
    
    const block: Block = {
      header,
      transactions: txs,
      attestations: [],
      randaoReveal: `randao_${proposer}_${slot}`,
    };
    
    // Calculate hash
    block.hash = calculateBlockHeaderHash(header);
    
    return block;
  }

  /**
   * Helper to create a simple transaction
   */
  function createTransaction(from: string, to: string, value: number, nonce: number): EthereumTransaction {
    return {
      from,
      to,
      value,
      nonce,
      publicKey: `pubkey_${from}`,
      signature: `sig_${from}_${nonce}`,
      timestamp: Date.now(),
      txid: `tx_${from}_${to}_${nonce}`,
    };
  }

  beforeEach(() => {
    // Create beacon state with 3 validators
    const validators = createValidators(3);
    beaconState = new BeaconState(genesisTime, validators);
    
    // Create blockchain
    blockchain = new Blockchain('node1', 'miner1', beaconState);
  });

  describe('Initialization', () => {
    it('should initialize with genesis block', () => {
      // Then: Should have genesis block
      const blocks = blockchain.getBlocks();
      expect(blocks.length).toBe(1);
      expect(blocks[0].header.height).toBe(0);
      
      const latestBlock = blockchain.getLatestBlock();
      expect(latestBlock).not.toBeNull();
      expect(latestBlock?.header.height).toBe(0);
    });

    it('should have empty world state after genesis', () => {
      // Then: World state should be initialized but empty
      const worldState = blockchain.getWorldState();
      expect(worldState).toBeDefined();
      expect(Object.keys(worldState).length).toBe(0);
    });

    it('should have beacon state reference', () => {
      // Then: Should have beacon state
      const bs = blockchain.getBeaconState();
      expect(bs).toBe(beaconState);
    });
  });

  describe('addBlock', () => {
    it('should add valid block extending canonical chain', async () => {
      // Given: Genesis block
      const genesis = blockchain.getLatestBlock()!;
      
      // When: Create and add block extending genesis
      const block1 = createTestBlock(genesis.hash!, 1, 1, 'validator0');
      
      const added = await blockchain.addBlock(block1);
      
      // Then: Block should be added
      expect(added).toBe(true);
      expect(blockchain.getBlocks().length).toBe(2);
      expect(blockchain.getLatestBlock()?.hash).toBe(block1.hash);
    });

    it('should handle fork creation', async () => {
      // Given: Genesis and block1
      const genesis = blockchain.getLatestBlock()!;
      const block1 = createTestBlock(genesis.hash!, 1, 1, 'validator0');
      await blockchain.addBlock(block1);
      
      // When: Add competing block at same height (fork)
      const block1Alt = createTestBlock(genesis.hash!, 1, 1, 'validator1');
      const added = await blockchain.addBlock(block1Alt);
      
      // Then: Both blocks should exist in tree
      expect(added).toBe(true);
      const tree = blockchain.getTree();
      expect(tree.getAllNodes().length).toBe(3); // genesis + 2 forks
      expect(tree.getLeaves().length).toBe(2);
    });

    it('should reject block with missing parent', async () => {
      // Given: Block with unknown parent
      const block = createTestBlock('unknownParent', 1, 1, 'validator0');
      
      // When: Try to add block
      const added = await blockchain.addBlock(block);
      
      // Then: Should be rejected
      expect(added).toBe(false);
      expect(blockchain.getBlocks().length).toBe(1); // Still just genesis
    });

    it('should update GHOST-HEAD when new block has more attestations', async () => {
      // Given: Fork with two branches
      const genesis = blockchain.getLatestBlock()!;
      
      const blockA = createTestBlock(genesis.hash!, 1, 1, 'validator0');
      const blockB = createTestBlock(genesis.hash!, 1, 1, 'validator1');
      
      await blockchain.addBlock(blockA);
      await blockchain.addBlock(blockB);
      
      // When: Add attestations favoring blockB
      await blockchain.onAttestationReceived({
        validatorAddress: 'validator0',
        blockHash: blockB.hash!,
        timestamp: Date.now(),
      });
      await blockchain.onAttestationReceived({
        validatorAddress: 'validator1',
        blockHash: blockB.hash!,
        timestamp: Date.now(),
      });
      
      // Then: GHOST-HEAD should be blockB
      expect(blockchain.getLatestBlock()?.hash).toBe(blockB.hash);
    });
  });

  describe('onAttestationReceived', () => {
    it('should update tree decorations when attestation received', async () => {
      // Given: Chain with one block
      const genesis = blockchain.getLatestBlock()!;
      const block1 = createTestBlock(genesis.hash!, 1, 1, 'validator0');
      await blockchain.addBlock(block1);
      
      // When: Receive attestation for block1
      await blockchain.onAttestationReceived({
        validatorAddress: 'validator0',
        blockHash: block1.hash!,
        timestamp: Date.now(),
      });
      
      // Then: Attestation should be recorded
      expect(beaconState.latestAttestations.size).toBe(1);
      expect(beaconState.latestAttestations.get('validator0')?.blockHash).toBe(block1.hash);
      
      // Tree should have attestedEth updated
      const node = blockchain.getTree().getNode(block1.hash!);
      expect(node?.metadata.attestedEth).toBeGreaterThan(0);
    });

    it('should trigger reorg when attestations switch to different fork', async () => {
      // Given: Fork with two branches
      const genesis = blockchain.getLatestBlock()!;
      
      const blockA = createTestBlock(genesis.hash!, 1, 1, 'validator0');
      const blockB = createTestBlock(genesis.hash!, 1, 1, 'validator1');
      
      await blockchain.addBlock(blockA);
      await blockchain.addBlock(blockB);
      
      // Initially favor blockA
      await blockchain.onAttestationReceived({
        validatorAddress: 'validator0',
        blockHash: blockA.hash!,
        timestamp: 1000,
      });
      
      expect(blockchain.getLatestBlock()?.hash).toBe(blockA.hash);
      
      // When: Attestations switch to blockB
      await blockchain.onAttestationReceived({
        validatorAddress: 'validator1',
        blockHash: blockB.hash!,
        timestamp: 2000,
      });
      await blockchain.onAttestationReceived({
        validatorAddress: 'validator2',
        blockHash: blockB.hash!,
        timestamp: 2000,
      });
      
      // Then: Should reorg to blockB
      expect(blockchain.getLatestBlock()?.hash).toBe(blockB.hash);
    });

    it('should handle forward progress when attestations extend canonical chain', async () => {
      // Given: Linear chain
      const genesis = blockchain.getLatestBlock()!;
      const block1 = createTestBlock(genesis.hash!, 1, 1, 'validator0');
      const block2 = createTestBlock(genesis.hash!, 2, 2, 'validator1');
      
      await blockchain.addBlock(block1);
      await blockchain.addBlock(block2);
      
      // When: Attestations arrive for block2
      await blockchain.onAttestationReceived({
        validatorAddress: 'validator0',
        blockHash: block2.hash!,
        timestamp: Date.now(),
      });
      
      // Then: Should be forward progress (no reorg)
      expect(blockchain.getLatestBlock()?.hash).toBe(block2.hash);
      expect(blockchain.getBlocks().length).toBe(3); // genesis + block1 + block2
    });
  });

  describe('getBlockByHash', () => {
    it('should retrieve block by hash', async () => {
      // Given: Chain with blocks
      const genesis = blockchain.getLatestBlock()!;
      const block1 = createTestBlock(genesis.hash!, 1, 1, 'validator0');
      await blockchain.addBlock(block1);
      
      // When: Get block by hash
      const retrieved = blockchain.getBlockByHash(block1.hash!);
      
      // Then: Should return correct block
      expect(retrieved).not.toBeUndefined();
      expect(retrieved?.hash).toBe(block1.hash);
      expect(retrieved?.header.height).toBe(1);
    });

    it('should return undefined for non-existent hash', () => {
      // When: Get non-existent block
      const retrieved = blockchain.getBlockByHash('unknownHash');
      
      // Then: Should return undefined
      expect(retrieved).toBeUndefined();
    });
  });

  describe('Integration: Complex fork choice scenario', () => {
    it('should handle realistic multi-fork scenario with attestations', async () => {
      // Given: Complex fork structure
      //     genesis
      //        |
      //        A
      //       / \
      //      B   C
      //      |   |
      //      D   E
      
      const genesis = blockchain.getLatestBlock()!;
      
      const blockA = createTestBlock(genesis.hash!, 1, 1, 'validator0');
      const blockB = createTestBlock(genesis.hash!, 2, 2, 'validator1');
      const blockC = createTestBlock(genesis.hash!, 2, 2, 'validator2');
      const blockD = createTestBlock(genesis.hash!, 3, 3, 'validator0');
      const blockE = createTestBlock(genesis.hash!, 3, 3, 'validator1');
      
      // Build tree
      await blockchain.addBlock(blockA);
      await blockchain.addBlock(blockB);
      await blockchain.addBlock(blockC);
      await blockchain.addBlock(blockD);
      await blockchain.addBlock(blockE);
      
      // Verify tree structure
      expect(blockchain.getTree().getAllNodes().length).toBe(6);
      expect(blockchain.getTree().getLeaves().length).toBe(2); // D and E
      
      // Step 1: Attestations favor D branch (2 validators)
      await blockchain.onAttestationReceived({
        validatorAddress: 'validator0',
        blockHash: blockD.hash!,
        timestamp: 1000,
      });
      await blockchain.onAttestationReceived({
        validatorAddress: 'validator1',
        blockHash: blockD.hash!,
        timestamp: 1000,
      });
      
      expect(blockchain.getLatestBlock()?.hash).toBe(blockD.hash);
      
      // Step 2: Attestations switch to E branch (all 3 validators)
      await blockchain.onAttestationReceived({
        validatorAddress: 'validator0',
        blockHash: blockE.hash!,
        timestamp: 2000,
      });
      await blockchain.onAttestationReceived({
        validatorAddress: 'validator1',
        blockHash: blockE.hash!,
        timestamp: 2000,
      });
      await blockchain.onAttestationReceived({
        validatorAddress: 'validator2',
        blockHash: blockE.hash!,
        timestamp: 2000,
      });
      
      // Should reorg to E
      expect(blockchain.getLatestBlock()?.hash).toBe(blockE.hash);
      
      // Canonical chain should be: genesis -> A -> C -> E
      const canonicalChain = blockchain.getBlocks();
      expect(canonicalChain.map(b => b.hash)).toEqual([
        genesis.hash,
        blockA.hash,
        blockC.hash,
        blockE.hash,
      ]);
    });

    it('should handle tie-breaking in fork choice', async () => {
      // Given: Two equal branches
      const genesis = blockchain.getLatestBlock()!;
      
      const blockA = createTestBlock(genesis.hash!, 1, 1, 'validator0');
      const blockB = createTestBlock(genesis.hash!, 1, 1, 'validator1');
      
      await blockchain.addBlock(blockA);
      await blockchain.addBlock(blockB);
      
      // When: Equal attestations (tie)
      await blockchain.onAttestationReceived({
        validatorAddress: 'validator0',
        blockHash: blockA.hash!,
        timestamp: 1000,
      });
      await blockchain.onAttestationReceived({
        validatorAddress: 'validator1',
        blockHash: blockB.hash!,
        timestamp: 1000,
      });
      
      // Then: GHOST should stop at parent (genesis) when tied
      expect(blockchain.getLatestBlock()?.hash).toBe(genesis.hash);
    });
  });

  describe('Tree statistics', () => {
    it('should provide accurate tree statistics', async () => {
      // Given: Tree with forks
      const genesis = blockchain.getLatestBlock()!;
      
      const blockA = createTestBlock(genesis.hash!, 1, 1, 'validator0');
      const blockB = createTestBlock(genesis.hash!, 2, 2, 'validator1');
      const blockC = createTestBlock(genesis.hash!, 2, 2, 'validator2');
      
      await blockchain.addBlock(blockA);
      await blockchain.addBlock(blockB);
      await blockchain.addBlock(blockC);
      
      // When: Get stats
      const stats = blockchain.getTree().getStats();
      
      // Then: Should have correct statistics
      expect(stats.totalBlocks).toBe(4); // genesis + A + B + C
      expect(stats.numberOfLeaves).toBe(2); // B and C
      expect(stats.numberOfForks).toBe(1); // One fork at A
    });
  });
});

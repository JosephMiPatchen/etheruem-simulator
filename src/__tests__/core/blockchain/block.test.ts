import { createGenesisBlock, createBlockTemplate } from '../../../core/blockchain/block';
import { Block, Transaction } from '../../../types/types';
import { SimulatorConfig } from '../../../config/config';
import { sha256Hash } from '../../../utils/cryptoUtils';

// Mock console methods
const originalConsole = { ...console };
beforeAll(() => {
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
  console.info = jest.fn();
});

afterAll(() => {
  console.log = originalConsole.log;
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;
});

describe('Block Module', () => {
  describe('createGenesisBlock', () => {
    it('should create a valid genesis block', () => {
      const minerNodeId = 'node1';
      const genesisBlock = createGenesisBlock(minerNodeId);
      
      // Check structure
      expect(genesisBlock).toBeDefined();
      expect(genesisBlock.header).toBeDefined();
      expect(genesisBlock.transactions).toBeDefined();
      expect(genesisBlock.hash).toBeDefined();
      
      // Check header
      expect(genesisBlock.header.height).toBe(0);
      expect(genesisBlock.header.previousHeaderHash).toBe(SimulatorConfig.GENESIS_PREV_HASH);
      expect(genesisBlock.header.ceiling).toBe(parseInt(SimulatorConfig.CEILING, 16));
      
      // Check transactions
      expect(genesisBlock.transactions.length).toBeGreaterThan(0);
      expect(genesisBlock.transactions[0].inputs[0].sourceOutputId).toBe(SimulatorConfig.REWARDER_NODE_ID);
    });
  });
  
  describe('createBlockTemplate', () => {
    // Mock data for testing
    const previousBlock: Block = {
      header: {
        transactionHash: 'mock-transaction-hash',
        timestamp: Date.now() - 10000,
        previousHeaderHash: SimulatorConfig.GENESIS_PREV_HASH,
        ceiling: parseInt(SimulatorConfig.CEILING, 16),
        nonce: 0,
        height: 0
      },
      transactions: [],
      hash: 'mock-previous-hash'
    };
    
    const mockTransactions: Transaction[] = [
      {
        txid: 'mock-tx-1',
        inputs: [{ sourceOutputId: SimulatorConfig.REWARDER_NODE_ID }],
        outputs: [
          { idx: 0, nodeId: 'miner1', value: SimulatorConfig.BLOCK_REWARD, lock: 'test-address-1' }
        ],
        timestamp: Date.now()
      },
      {
        txid: 'mock-tx-2',
        inputs: [{ sourceOutputId: 'some-utxo-id' }],
        outputs: [
          { idx: 0, nodeId: 'miner1', value: 5, lock: 'test-address-1' },
          { idx: 1, nodeId: 'peer1', value: 5, lock: 'test-address-2' }
        ],
        timestamp: Date.now()
      }
    ];
    
    it('should create a valid block', () => {
      const block = createBlockTemplate(previousBlock, mockTransactions);
      
      // Check structure
      expect(block).toBeDefined();
      expect(block.header).toBeDefined();
      expect(block.transactions).toBeDefined();
      expect(block.hash).toBeDefined();
      
      // Check header
      expect(block.header.height).toBe(previousBlock.header.height + 1);
      expect(block.header.previousHeaderHash).toBe(previousBlock.hash);
      expect(block.header.ceiling).toBe(parseInt(SimulatorConfig.CEILING, 16));
      expect(block.header.nonce).toBe(0); // Initial nonce
      
      // Check transactions
      expect(block.transactions).toEqual(mockTransactions);
      
      // Check transaction hash
      const expectedTransactionHash = sha256Hash(JSON.stringify(mockTransactions));
      expect(block.header.transactionHash).toBe(expectedTransactionHash);
    });
    
    it('should create a block with incremented height', () => {
      const block = createBlockTemplate(previousBlock, mockTransactions);
      expect(block.header.height).toBe(previousBlock.header.height + 1);
    });
    
    it('should create a block with the previous block hash', () => {
      const block = createBlockTemplate(previousBlock, mockTransactions);
      expect(block.header.previousHeaderHash).toBe(previousBlock.hash);
    });
    
    it('should create a block with a timestamp greater than the previous block', () => {
      const block = createBlockTemplate(previousBlock, mockTransactions);
      expect(block.header.timestamp).toBeGreaterThan(previousBlock.header.timestamp);
    });
  });
});

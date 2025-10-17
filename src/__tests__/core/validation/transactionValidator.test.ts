import { calculateTxid, validateTransaction } from '../../../core/validation/transactionValidator';
import { Transaction, TransactionInput, TransactionOutput } from '../../../types/types';
import { SimulatorConfig } from '../../../config/config';

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

// Mock security validator
jest.mock('../../../core/validation/securityValidator', () => ({
  validateTransactionSecurity: jest.fn().mockResolvedValue(true)
}));

describe('Transaction Validator', () => {
  // Mock UTXO set for testing
  const mockUtxoSet = {
    'tx1-0': {
      idx: 0,
      nodeId: 'node1',
      value: 10,
      lock: 'test-lock-1'
    },
    'tx2-0': {
      idx: 0,
      nodeId: 'node2',
      value: 5,
      lock: 'test-lock-2'
    }
  };

  describe('calculateTxid', () => {
    it('should generate a consistent transaction ID for the same inputs', () => {
      const inputs: TransactionInput[] = [{ sourceOutputId: 'tx1-0' }];
      const outputs: TransactionOutput[] = [
        { idx: 0, nodeId: 'node2', value: 5, lock: 'test-lock-2' },
        { idx: 1, nodeId: 'node1', value: 5, lock: 'test-lock-1' }
      ];
      const blockHeight = 1;

      const txid1 = calculateTxid(inputs, outputs, blockHeight);
      const txid2 = calculateTxid(inputs, outputs, blockHeight);

      expect(txid1).toBe(txid2);
    });

    it('should generate different IDs for different inputs', () => {
      const inputs1: TransactionInput[] = [{ sourceOutputId: 'tx1-0' }];
      const inputs2: TransactionInput[] = [{ sourceOutputId: 'tx2-0' }];
      const outputs: TransactionOutput[] = [
        { idx: 0, nodeId: 'node2', value: 5, lock: 'test-lock-2' },
        { idx: 1, nodeId: 'node1', value: 5, lock: 'test-lock-1' }
      ];
      const blockHeight = 1;

      const txid1 = calculateTxid(inputs1, outputs, blockHeight);
      const txid2 = calculateTxid(inputs2, outputs, blockHeight);

      expect(txid1).not.toBe(txid2);
    });

    it('should generate different IDs for different block heights', () => {
      const inputs: TransactionInput[] = [{ sourceOutputId: 'tx1-0' }];
      const outputs: TransactionOutput[] = [
        { idx: 0, nodeId: 'node2', value: 5, lock: 'test-lock-2' },
        { idx: 1, nodeId: 'node1', value: 5, lock: 'test-lock-1' }
      ];

      const txid1 = calculateTxid(inputs, outputs, 1);
      const txid2 = calculateTxid(inputs, outputs, 2);

      expect(txid1).not.toBe(txid2);
    });
  });

  describe('validateTransaction', () => {
    // Test for coinbase transactions
    it('should validate a valid coinbase transaction', async () => {
      const coinbaseTx: Transaction = {
        inputs: [{ sourceOutputId: SimulatorConfig.REWARDER_NODE_ID }],
        outputs: [{ idx: 0, nodeId: 'node1', value: SimulatorConfig.BLOCK_REWARD, lock: 'test-lock-1' }],
        timestamp: Date.now()
      };

      const result = await validateTransaction(coinbaseTx, mockUtxoSet, 1, true);
      expect(result).toBe(true);
    });

    it('should reject a coinbase transaction with invalid reward', async () => {
      const coinbaseTx: Transaction = {
        inputs: [{ sourceOutputId: SimulatorConfig.REWARDER_NODE_ID }],
        outputs: [{ idx: 0, nodeId: 'node1', value: SimulatorConfig.BLOCK_REWARD + 1, lock: 'test-lock-1' }], // Invalid reward
        timestamp: Date.now()
      };

      const result = await validateTransaction(coinbaseTx, mockUtxoSet, 1, true);
      expect(result).toBe(false);
    });

    it('should reject a coinbase transaction with multiple inputs', async () => {
      const coinbaseTx: Transaction = {
        inputs: [
          { sourceOutputId: SimulatorConfig.REWARDER_NODE_ID },
          { sourceOutputId: 'tx1-0' } // Invalid second input
        ],
        outputs: [{ idx: 0, nodeId: 'node1', value: SimulatorConfig.BLOCK_REWARD, lock: 'test-lock-1' }],
        timestamp: Date.now()
      };

      const result = await validateTransaction(coinbaseTx, mockUtxoSet, 1, true);
      expect(result).toBe(false);
    });

    // Test for regular transactions
    it('should validate a valid regular transaction', async () => {
      const tx: Transaction = {
        inputs: [{ sourceOutputId: 'tx1-0' }], // 10 BTC input
        outputs: [
          { idx: 0, nodeId: 'node2', value: 6, lock: 'test-lock-2' },
          { idx: 1, nodeId: 'node1', value: 4, lock: 'test-lock-1' }
        ],
        timestamp: Date.now()
      };

      const result = await validateTransaction(tx, mockUtxoSet, 1);
      expect(result).toBe(true);
    });

    it('should reject a transaction with inputs not in UTXO set', async () => {
      const tx: Transaction = {
        inputs: [{ sourceOutputId: 'nonexistent-0' }],
        outputs: [{ idx: 0, nodeId: 'node2', value: 5, lock: 'test-lock-2' }],
        timestamp: Date.now()
      };

      const result = await validateTransaction(tx, mockUtxoSet, 1);
      expect(result).toBe(false);
    });

    it('should reject a transaction with outputs exceeding inputs', async () => {
      const tx: Transaction = {
        inputs: [{ sourceOutputId: 'tx1-0' }], // 10 BTC input
        outputs: [
          { idx: 0, nodeId: 'node2', value: 6, lock: 'test-lock-2' },
          { idx: 1, nodeId: 'node1', value: 5, lock: 'test-lock-1' } // Total: 11 BTC, exceeds input
        ],
        timestamp: Date.now()
      };

      const result = await validateTransaction(tx, mockUtxoSet, 1);
      expect(result).toBe(false);
    });

    it('should reject a transaction with non-positive output values', async () => {
      const tx: Transaction = {
        inputs: [{ sourceOutputId: 'tx1-0' }],
        outputs: [
          { idx: 0, nodeId: 'node2', value: 0, lock: 'test-lock-2' }, // Zero value
          { idx: 1, nodeId: 'node1', value: 10, lock: 'test-lock-1' }
        ],
        timestamp: Date.now()
      };

      const result = await validateTransaction(tx, mockUtxoSet, 1);
      expect(result).toBe(false);
    });

    it('should reject a transaction with non-sequential output indices', async () => {
      const tx: Transaction = {
        inputs: [{ sourceOutputId: 'tx1-0' }],
        outputs: [
          { idx: 0, nodeId: 'node2', value: 5, lock: 'test-lock-2' },
          { idx: 2, nodeId: 'node1', value: 5, lock: 'test-lock-1' } // Index should be 1
        ],
        timestamp: Date.now()
      };

      const result = await validateTransaction(tx, mockUtxoSet, 1);
      expect(result).toBe(false);
    });

    it('should reject a transaction with incorrect txid', async () => {
      const inputs = [{ sourceOutputId: 'tx1-0' }];
      const outputs = [
        { idx: 0, nodeId: 'node2', value: 5, lock: 'test-lock-2' },
        { idx: 1, nodeId: 'node1', value: 5, lock: 'test-lock-1' }
      ];
      const blockHeight = 1;
      
      
      const tx: Transaction = {
        inputs,
        outputs,
        txid: 'incorrect-txid', // Incorrect txid
        timestamp: Date.now()
      };

      const result = await validateTransaction(tx, mockUtxoSet, blockHeight);
      expect(result).toBe(false);
    });
  });
});

import { updateUTXOSet } from '../../../core/blockchain/utxo';
import { Transaction, UTXOSet } from '../../../types/types';
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

describe('UTXO Module', () => {
  describe('updateUTXOSet', () => {
    // Initial UTXO set for testing
    let utxoSet: UTXOSet;
    
    beforeEach(() => {
      // Reset UTXO set before each test
      utxoSet = {
        'tx1-0': {
          idx: 0,
          nodeId: 'node1',
          value: 10
        },
        'tx2-0': {
          idx: 0,
          nodeId: 'node2',
          value: 5
        }
      };
    });
    
    it('should add outputs from a coinbase transaction', () => {
      const coinbaseTx: Transaction = {
        txid: 'coinbase-tx',
        inputs: [{ sourceOutputId: SimulatorConfig.REWARDER_NODE_ID }],
        outputs: [{ idx: 0, nodeId: 'node3', value: SimulatorConfig.BLOCK_REWARD }],
        timestamp: Date.now()
      };
      
      const updatedUtxo = updateUTXOSet(utxoSet, coinbaseTx);
      
      // Original UTXOs should remain
      expect(updatedUtxo['tx1-0']).toEqual(utxoSet['tx1-0']);
      expect(updatedUtxo['tx2-0']).toEqual(utxoSet['tx2-0']);
      
      // New coinbase output should be added
      expect(updatedUtxo['coinbase-tx-0']).toBeDefined();
      expect(updatedUtxo['coinbase-tx-0'].nodeId).toBe('node3');
      expect(updatedUtxo['coinbase-tx-0'].value).toBe(SimulatorConfig.BLOCK_REWARD);
    });
    
    it('should remove spent inputs and add new outputs for regular transactions', () => {
      const regularTx: Transaction = {
        txid: 'regular-tx',
        inputs: [{ sourceOutputId: 'tx1-0' }], // Spending the first UTXO
        outputs: [
          { idx: 0, nodeId: 'node3', value: 6 },
          { idx: 1, nodeId: 'node1', value: 4 }
        ],
        timestamp: Date.now()
      };
      
      const updatedUtxo = updateUTXOSet(utxoSet, regularTx);
      
      // Spent UTXO should be removed
      expect(updatedUtxo['tx1-0']).toBeUndefined();
      
      // Unspent UTXO should remain
      expect(updatedUtxo['tx2-0']).toEqual(utxoSet['tx2-0']);
      
      // New outputs should be added
      expect(updatedUtxo['regular-tx-0']).toBeDefined();
      expect(updatedUtxo['regular-tx-0'].nodeId).toBe('node3');
      expect(updatedUtxo['regular-tx-0'].value).toBe(6);
      
      expect(updatedUtxo['regular-tx-1']).toBeDefined();
      expect(updatedUtxo['regular-tx-1'].nodeId).toBe('node1');
      expect(updatedUtxo['regular-tx-1'].value).toBe(4);
    });
    
    it('should process multiple transactions in order', () => {
      const coinbaseTx: Transaction = {
        txid: 'coinbase-tx',
        inputs: [{ sourceOutputId: SimulatorConfig.REWARDER_NODE_ID }],
        outputs: [{ idx: 0, nodeId: 'node1', value: SimulatorConfig.BLOCK_REWARD }],
        timestamp: Date.now()
      };
      
      const spendingTx: Transaction = {
        txid: 'spending-tx',
        inputs: [{ sourceOutputId: 'coinbase-tx-0' }], // Spending the coinbase output
        outputs: [
          { idx: 0, nodeId: 'node2', value: 2 },
          { idx: 1, nodeId: 'node1', value: 2 }
        ],
        timestamp: Date.now()
      };
      
      // Process both transactions sequentially
      let updatedUtxo = updateUTXOSet(utxoSet, coinbaseTx);
      updatedUtxo = updateUTXOSet(updatedUtxo, spendingTx);
      
      // Original UTXOs should remain
      expect(updatedUtxo['tx1-0']).toEqual(utxoSet['tx1-0']);
      expect(updatedUtxo['tx2-0']).toEqual(utxoSet['tx2-0']);
      
      // Coinbase output should be spent (removed)
      expect(updatedUtxo['coinbase-tx-0']).toBeUndefined();
      
      // New outputs from spending transaction should be added
      expect(updatedUtxo['spending-tx-0']).toBeDefined();
      expect(updatedUtxo['spending-tx-0'].nodeId).toBe('node2');
      expect(updatedUtxo['spending-tx-0'].value).toBe(2);
      
      expect(updatedUtxo['spending-tx-1']).toBeDefined();
      expect(updatedUtxo['spending-tx-1'].nodeId).toBe('node1');
      expect(updatedUtxo['spending-tx-1'].value).toBe(2);
    });
    
    it('should handle multiple inputs and outputs', () => {
      const complexTx: Transaction = {
        txid: 'complex-tx',
        inputs: [
          { sourceOutputId: 'tx1-0' }, // 10 BTC
          { sourceOutputId: 'tx2-0' }  // 5 BTC
        ],
        outputs: [
          { idx: 0, nodeId: 'node3', value: 8 },
          { idx: 1, nodeId: 'node4', value: 4 },
          { idx: 2, nodeId: 'node1', value: 3 }
        ],
        timestamp: Date.now()
      };
      
      const updatedUtxo = updateUTXOSet(utxoSet, complexTx);
      
      // Both inputs should be spent (removed)
      expect(updatedUtxo['tx1-0']).toBeUndefined();
      expect(updatedUtxo['tx2-0']).toBeUndefined();
      
      // All three outputs should be added
      expect(updatedUtxo['complex-tx-0']).toBeDefined();
      expect(updatedUtxo['complex-tx-0'].nodeId).toBe('node3');
      expect(updatedUtxo['complex-tx-0'].value).toBe(8);
      
      expect(updatedUtxo['complex-tx-1']).toBeDefined();
      expect(updatedUtxo['complex-tx-1'].nodeId).toBe('node4');
      expect(updatedUtxo['complex-tx-1'].value).toBe(4);
      
      expect(updatedUtxo['complex-tx-2']).toBeDefined();
      expect(updatedUtxo['complex-tx-2'].nodeId).toBe('node1');
      expect(updatedUtxo['complex-tx-2'].value).toBe(3);
    });
    
    it('should ignore transactions with inputs not in the UTXO set', () => {
      const invalidTx: Transaction = {
        txid: 'invalid-tx',
        inputs: [{ sourceOutputId: 'nonexistent-0' }],
        outputs: [{ idx: 0, nodeId: 'node3', value: 5 }],
        timestamp: Date.now()
      };
      
      const updatedUtxo = updateUTXOSet(utxoSet, invalidTx);
      
      // UTXO set should remain unchanged
      expect(updatedUtxo).toEqual(utxoSet);
      expect(updatedUtxo['invalid-tx-0']).toBeUndefined();
    });
  });
});

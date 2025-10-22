import { WorldState } from '../../../core/blockchain/worldState';
import { EthereumEthereumTransaction, Account } from '../../../types/types';
import { SimulatorConfig } from '../../../config/config';

describe('WorldState', () => {
  // Helper function to create mock Ethereum transactions
  const createMockTransaction = (
    from: string,
    to: string,
    value: number,
    nonce: number = 0
  ): EthereumTransaction => ({
    from,
    to,
    value,
    nonce,
    publicKey: 'mock-public-key',
    signature: 'mock-signature',
    timestamp: Date.now(),
    txid: `mock-txid-${from}-${to}-${value}-${nonce}`
  });

  // Helper function to create mock coinbase transaction
  const createMockCoinbaseTransaction = (
    to: string,
    value: number
  ): EthereumTransaction => ({
    from: SimulatorConfig.REWARDER_NODE_ID,
    to,
    value,
    nonce: 0,
    publicKey: '',
    signature: 'coinbase-signature',
    timestamp: Date.now(),
    txid: `coinbase-${to}-${value}`
  });

  describe('constructor', () => {
    it('should create empty WorldState', () => {
      const worldState = new WorldState();
      expect(Object.keys(worldState.accounts)).toHaveLength(0);
    });

    it('should create WorldState with initial accounts', () => {
      const initialAccounts: Record<string, Account> = {
        'address1': { address: 'address1', balance: 100, nonce: 0 },
        'address2': { address: 'address2', balance: 200, nonce: 0 }
      };
      const worldState = new WorldState(initialAccounts);
      
      expect(worldState.getAccount('address1')?.balance).toBe(100);
      expect(worldState.getAccount('address2')?.balance).toBe(200);
    });
  });

  describe('getAccount', () => {
    it('should return account if it exists', () => {
      const worldState = new WorldState({
        'address1': { address: 'address1', balance: 100, nonce: 5 }
      });
      
      const account = worldState.getAccount('address1');
      expect(account).toEqual({ address: 'address1', balance: 100, nonce: 5 });
    });

    it('should return undefined if account does not exist', () => {
      const worldState = new WorldState();
      const account = worldState.getAccount('nonexistent');
      expect(account).toBeUndefined();
    });
  });

  describe('updateWithTransaction', () => {
    it('should process coinbase transaction and create new account', () => {
      const worldState = new WorldState();
      const tx = createMockCoinbaseTransaction('miner-address', 50);
      
      const success = worldState.updateWithTransaction(tx);
      
      expect(success).toBe(true);
      expect(worldState.getAccount('miner-address')?.balance).toBe(50);
      expect(worldState.getAccount('miner-address')?.nonce).toBe(0);
    });

    it('should process regular transaction between existing accounts', () => {
      const worldState = new WorldState({
        'alice': { address: 'alice', balance: 100, nonce: 0 },
        'bob': { address: 'bob', balance: 50, nonce: 0 }
      });
      
      const tx = createMockTransaction('alice', 'bob', 30, 0);
      const success = worldState.updateWithTransaction(tx);
      
      expect(success).toBe(true);
      expect(worldState.getAccount('alice')?.balance ?? 0).toBe(70);
      expect(worldState.getAccount('alice')?.nonce ?? 0).toBe(1);
      expect(worldState.getAccount('bob')?.balance ?? 0).toBe(80);
      expect(worldState.getAccount('bob')?.nonce ?? 0).toBe(0);
    });

    it('should create recipient account if it does not exist', () => {
      const worldState = new WorldState({
        'alice': { address: 'alice', balance: 100, nonce: 0 }
      });
      
      const tx = createMockTransaction('alice', 'new-recipient', 25, 0);
      const success = worldState.updateWithTransaction(tx);
      
      expect(success).toBe(true);
      expect(worldState.getAccount('alice')?.balance ?? 0).toBe(75);
      expect(worldState.getAccount('new-recipient')?.balance ?? 0).toBe(25);
      expect(worldState.getAccount('new-recipient')?.nonce ?? 0).toBe(0);
    });

    it('should reject transaction if sender account does not exist', () => {
      const worldState = new WorldState({
        'bob': { address: 'bob', balance: 50, nonce: 0 }
      });
      
      const tx = createMockTransaction('nonexistent', 'bob', 10, 0);
      const success = worldState.updateWithTransaction(tx);
      
      expect(success).toBe(false);
      expect(worldState.getAccount('bob')?.balance ?? 0).toBe(50); // Unchanged
    });

    it('should reject transaction if sender has insufficient balance', () => {
      const worldState = new WorldState({
        'alice': { address: 'alice', balance: 20, nonce: 0 },
        'bob': { address: 'bob', balance: 50, nonce: 0 }
      });
      
      const tx = createMockTransaction('alice', 'bob', 30, 0);
      const success = worldState.updateWithTransaction(tx);
      
      expect(success).toBe(false);
      expect(worldState.getAccount('alice')?.balance ?? 0).toBe(20); // Unchanged
      expect(worldState.getAccount('bob')?.balance ?? 0).toBe(50); // Unchanged
    });

    it('should increment sender nonce on successful transaction', () => {
      const worldState = new WorldState({
        'alice': { address: 'alice', balance: 100, nonce: 5 },
        'bob': { address: 'bob', balance: 50, nonce: 3 }
      });
      
      const tx = createMockTransaction('alice', 'bob', 10, 5);
      const success = worldState.updateWithTransaction(tx);
      
      expect(success).toBe(true);
      expect(worldState.getAccount('alice')?.nonce ?? 0).toBe(6);
      expect(worldState.getAccount('bob')?.nonce ?? 0).toBe(3); // Recipient nonce unchanged
    });

    it('should handle transaction with zero value', () => {
      const worldState = new WorldState({
        'alice': { address: 'alice', balance: 100, nonce: 0 },
        'bob': { address: 'bob', balance: 50, nonce: 0 }
      });
      
      const tx = createMockTransaction('alice', 'bob', 0, 0);
      const success = worldState.updateWithTransaction(tx);
      
      expect(success).toBe(true);
      expect(worldState.getAccount('alice')?.balance ?? 0).toBe(100);
      expect(worldState.getAccount('bob')?.balance ?? 0).toBe(50);
      expect(worldState.getAccount('alice')?.nonce ?? 0).toBe(1); // Nonce still increments
    });
  });

  describe('fromTransactions', () => {
    it('should rebuild WorldState from transaction list', () => {
      const transactions = [
        createMockCoinbaseTransaction('alice', 100),
        createMockCoinbaseTransaction('bob', 50),
        createMockTransaction('alice', 'bob', 20, 0),
        createMockTransaction('bob', 'alice', 10, 0)
      ];
      
      const worldState = WorldState.fromTransactions(transactions);
      
      expect(worldState.getAccount('alice')?.balance ?? 0).toBe(90); // 100 - 20 + 10
      expect(worldState.getAccount('bob')?.balance ?? 0).toBe(60); // 50 + 20 - 10
      expect(worldState.getAccount('alice')?.nonce ?? 0).toBe(1);
      expect(worldState.getAccount('bob')?.nonce ?? 0).toBe(1);
    });

    it('should handle empty transaction list', () => {
      const worldState = WorldState.fromTransactions([]);
      expect(Object.keys(worldState.accounts)).toHaveLength(0);
    });

    it('should process transactions in order', () => {
      const transactions = [
        createMockCoinbaseTransaction('alice', 100),
        createMockTransaction('alice', 'bob', 30, 0),
        createMockTransaction('alice', 'charlie', 20, 1),
        createMockTransaction('bob', 'charlie', 10, 0)
      ];
      
      const worldState = WorldState.fromTransactions(transactions);
      
      expect(worldState.getAccount('alice')?.balance ?? 0).toBe(50); // 100 - 30 - 20
      expect(worldState.getAccount('bob')?.balance ?? 0).toBe(20); // 30 - 10
      expect(worldState.getAccount('charlie')?.balance ?? 0).toBe(30); // 20 + 10
      expect(worldState.getAccount('alice')?.nonce ?? 0).toBe(2);
      expect(worldState.getAccount('bob')?.nonce ?? 0).toBe(1);
    });
  });

  describe('accounts property', () => {
    it('should allow direct access to accounts', () => {
      const worldState = new WorldState({
        'alice': { address: 'alice', balance: 100, nonce: 0 },
        'bob': { address: 'bob', balance: 50, nonce: 0 },
        'charlie': { address: 'charlie', balance: 75, nonce: 0 }
      });
      
      expect(Object.keys(worldState.accounts)).toHaveLength(3);
      expect(worldState.accounts['alice']).toBeDefined();
      expect(worldState.accounts['bob']).toBeDefined();
      expect(worldState.accounts['charlie']).toBeDefined();
      expect(worldState.accounts['alice'].balance).toBe(100);
    });
  });
});

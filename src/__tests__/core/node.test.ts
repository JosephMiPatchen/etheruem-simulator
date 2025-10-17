import { Node } from '../../core/node';
import { PeerInfoMap } from '../../types/types';

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
import { Block } from '../../types/types';
import { SimulatorConfig } from '../../config/config';

describe('Node Module', () => {
  let node: Node;
  const nodeId = 'test-node';
  const peerIds = ['peer1', 'peer2', 'peer3'];
  
  beforeEach(() => {
    node = new Node(nodeId);
    
    // Create peers with addresses and public keys
    const peers: PeerInfoMap = {};
    peerIds.forEach(peerId => {
      peers[peerId] = { 
        address: `address-${peerId}`,

      };
    });
    node.setPeerInfosWithAddresses(peers);
    
    // Mock the hash calculation to make mining deterministic
    jest.spyOn(global.Math, 'random').mockReturnValue(0.1);
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('initialization', () => {
    it('should initialize with correct properties', () => {
      const state = node.getState();
      expect(state.nodeId).toBe(nodeId);
      expect(state.peerIds).toEqual(peerIds);
      expect(state.blockchain.length).toBe(1); // Genesis block
      expect(state.isMining).toBe(false);
    });
    
    it('should have a valid genesis block', () => {
      const genesisBlock = node.getBlocks()[0];
      expect(genesisBlock.header.height).toBe(0);
      expect(genesisBlock.header.previousHeaderHash).toBe(SimulatorConfig.GENESIS_PREV_HASH);
    });
  });
  
  describe('mining operations', () => {
    it('should start and stop mining', () => {
      // Mock the miner to avoid actual computation
      const mockMiner = { startMining: jest.fn(), stopMining: jest.fn() };
      (node as any).miner = mockMiner;
      
      // Start mining
      node.startMining();
      
      // Check that the miner's startMining was called
      expect(mockMiner.startMining).toHaveBeenCalled();
      
      // Stop mining
      node.stopMining();
      
      // Check that the miner's stopMining was called
      expect(mockMiner.stopMining).toHaveBeenCalled();
    });
  });
  
  describe('block handling', () => {
    it('should process a received block', async () => {
      // Mock the blockchain's addBlock method
      const mockBlockchain = { addBlock: jest.fn().mockReturnValue(true), getLatestBlock: jest.fn() };
      (node as any).blockchain = mockBlockchain;
      
      // Mock the miner to avoid actual computation
      const mockMiner = { startMining: jest.fn(), stopMining: jest.fn() };
      (node as any).miner = mockMiner;
      
      // Create a mock block
      const block: Block = {
        header: {
          transactionHash: 'test-tx-hash',
          timestamp: Date.now(),
          previousHeaderHash: 'previous-hash',
          ceiling: parseInt(SimulatorConfig.CEILING, 16),
          nonce: 123,
          height: 1
        },
        transactions: [],
        hash: 'test-block-hash'
      };
      
      // Set up a callback to check if it's called
      const chainUpdatedCallback = jest.fn();
      node.setOnChainUpdated(chainUpdatedCallback);
      
      // Handle the received block
      await node.receiveBlock(block);
      
      // Should add the block to the blockchain
      expect(mockBlockchain.addBlock).toHaveBeenCalledWith(block);
      
      // Should call the callback
      expect(chainUpdatedCallback).toHaveBeenCalled();
    });
  });
  
  describe('chain replacement', () => {
    it('should replace its chain with a longer valid chain', async () => {
      // Create a longer chain
      const longerChain: Block[] = [
        {
          header: {
            transactionHash: 'genesis-tx-hash',
            timestamp: Date.now(),
            previousHeaderHash: SimulatorConfig.GENESIS_PREV_HASH,
            ceiling: parseInt(SimulatorConfig.CEILING, 16),
            nonce: 0,
            height: 0
          },
          transactions: [],
          hash: 'genesis-hash'
        },
        {
          header: {
            transactionHash: 'test-tx-hash',
            timestamp: Date.now(),
            previousHeaderHash: 'genesis-hash',
            ceiling: parseInt(SimulatorConfig.CEILING, 16),
            nonce: 123,
            height: 1
          },
          transactions: [],
          hash: 'test-block-hash'
        }
      ];
      
      // Mock the blockchain's replaceChain method
      const mockBlockchain = { replaceChain: jest.fn().mockReturnValue(true), getLatestBlock: jest.fn() };
      (node as any).blockchain = mockBlockchain;
      
      // Mock the miner to avoid actual computation
      const mockMiner = { startMining: jest.fn(), stopMining: jest.fn() };
      (node as any).miner = mockMiner;
      
      // Set up a callback to check if it's called
      const chainUpdatedCallback = jest.fn();
      node.setOnChainUpdated(chainUpdatedCallback);
      
      // Replace the chain
      await node.receiveChain(longerChain);
      
      // Should call the blockchain's replaceChain method
      expect(mockBlockchain.replaceChain).toHaveBeenCalledWith(longerChain);
      
      // Should call the callback
      expect(chainUpdatedCallback).toHaveBeenCalled();
    });
    
    it('should not replace its chain with an invalid chain', () => {
      // Mock console.error to suppress expected error message
      const originalConsoleError = console.error;
      console.error = jest.fn();
      // Create an invalid chain
      const invalidChain: Block[] = [
        {
          header: {
            transactionHash: 'genesis-tx-hash',
            timestamp: Date.now(),
            previousHeaderHash: SimulatorConfig.GENESIS_PREV_HASH,
            ceiling: parseInt(SimulatorConfig.CEILING, 16),
            nonce: 0,
            height: 0
          },
          transactions: [],
          hash: 'genesis-hash'
        },
        {
          header: {
            transactionHash: 'test-tx-hash',
            timestamp: Date.now(),
            previousHeaderHash: 'invalid-previous-hash',
            ceiling: parseInt(SimulatorConfig.CEILING, 16),
            nonce: 123,
            height: 1
          },
          transactions: [],
          hash: 'test-block-hash'
        }
      ];
      
      // Mock the blockchain's replaceChain method to return false (invalid chain)
      const mockBlockchain = { replaceChain: jest.fn().mockReturnValue(false) };
      (node as any).blockchain = mockBlockchain;
      
      // Set up a callback to check if it's called
      const chainUpdatedCallback = jest.fn();
      node.setOnChainUpdated(chainUpdatedCallback);
      
      // Try to replace the chain
      node.receiveChain(invalidChain);
      
      // Should call the blockchain's replaceChain method
      expect(mockBlockchain.replaceChain).toHaveBeenCalledWith(invalidChain);
      
      // Should not call the callback
      expect(chainUpdatedCallback).not.toHaveBeenCalled();

      // Restore console.error
      console.error = originalConsoleError;
    });
  });
  
  describe('state management', () => {
    it('should provide its current state', () => {
      // Mock the blockchain and miner
      const mockBlocks = [{ header: { height: 0 }, transactions: [], hash: 'test-hash' }];
      const mockUtxo = { 'test-utxo': { idx: 0, nodeId: 'test', value: 10 } };
      const mockBlockchain = { 
        getBlocks: jest.fn().mockReturnValue(mockBlocks),
        getUTXOSet: jest.fn().mockReturnValue(mockUtxo)
      };
      const mockMiner = { getIsMining: jest.fn().mockReturnValue(false) };
      
      (node as any).blockchain = mockBlockchain;
      (node as any).miner = mockMiner;
      
      const state = node.getState();
      
      expect(state.nodeId).toBe(nodeId);
      expect(state.blockchain).toEqual(mockBlocks);
      expect(state.utxo).toEqual(mockUtxo);
      expect(state.isMining).toBe(false);
      expect(state.peerIds).toEqual(peerIds);
    });
  });
});

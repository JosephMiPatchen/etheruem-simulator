import { Miner } from '../../../core/mining/miner';

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
import { PeerInfoMap } from '../../../types/types';
import { Node } from '../../../core/node';
import { Block } from '../../../types/types';
import { SimulatorConfig } from '../../../config/config';

describe('Miner Module', () => {
  let miner: Miner;
  let mockNode: Node;
  const nodeId = 'test-node';
  const peerIds = ['peer1', 'peer2', 'peer3'];
  let blockMinedCallback: jest.Mock;
  
  // Mock peer infos
  const mockPeers: PeerInfoMap = {
    'peer1': { address: 'address1' },
    'peer2': { address: 'address2' },
    'peer3': { address: 'address3' }
  };
  
  beforeEach(() => {
    blockMinedCallback = jest.fn();
    
    // Create a mock Node with the necessary methods
    mockNode = {
      getPrivateKey: jest.fn().mockReturnValue('0000000000000000000000000000000000000000000000000000000000000001'),
      getPublicKey: jest.fn().mockReturnValue('mock-public-key'),
      getAddress: jest.fn().mockReturnValue('mock-address'),
      getNodeId: jest.fn().mockReturnValue(nodeId),
      getPeerInfos: jest.fn().mockReturnValue(mockPeers)
    } as unknown as Node;
    
    miner = new Miner(blockMinedCallback, mockNode);
    
    // Mock the hash calculation to make mining deterministic
    jest.spyOn(global.Math, 'random').mockReturnValue(0.1);
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('initialization', () => {
    it('should initialize with correct properties', () => {
      expect(miner.getIsMining()).toBe(false);
    });
  });
  
  describe('createBlockTransactions', () => {
    it('should create a coinbase transaction and redistribution transaction', async () => {
      const height = 1;
      const transactions = await (miner as any).createBlockTransactions(height);
      
      // Should have 2 transactions
      expect(transactions.length).toBe(2);
      
      // First transaction should be coinbase
      const coinbaseTx = transactions[0];
      expect(coinbaseTx.inputs[0].sourceOutputId).toBe(SimulatorConfig.REWARDER_NODE_ID);
      expect(coinbaseTx.outputs[0].nodeId).toBe(nodeId);
      expect(coinbaseTx.outputs[0].value).toBe(SimulatorConfig.BLOCK_REWARD);
      
      // Second transaction should redistribute coins
      const redistributionTx = transactions[1];
      expect(redistributionTx.inputs[0].sourceOutputId).toBe(`${coinbaseTx.txid}-0`);
      
      // Should have outputs for each peer plus change back to miner
      expect(redistributionTx.outputs.length).toBe(peerIds.length + 1);
      
      // Check peer outputs
      const redistributionAmount = SimulatorConfig.BLOCK_REWARD * SimulatorConfig.REDISTRIBUTION_RATIO;
      const amountPerPeer = redistributionAmount / peerIds.length;
      
      for (let i = 0; i < peerIds.length; i++) {
        expect(redistributionTx.outputs[i].nodeId).toBe(peerIds[i]);
        expect(redistributionTx.outputs[i].value).toBeCloseTo(amountPerPeer);
      }
      
      // Check change output
      const changeOutput = redistributionTx.outputs[peerIds.length];
      expect(changeOutput.nodeId).toBe(nodeId);
      expect(changeOutput.value).toBeCloseTo(SimulatorConfig.BLOCK_REWARD - redistributionAmount);
    });
  });
  
  describe('startMining', () => {
    it('should start the mining process', async () => {
      // Mock createBlockTransactions to return a fixed result
      jest.spyOn(miner as any, 'createBlockTransactions').mockResolvedValue([
        { txid: 'mock-coinbase-txid', inputs: [], outputs: [] },
        { txid: 'mock-redistribution-txid', inputs: [], outputs: [] }
      ]);
      
      // Mock the mining process to avoid actual computation
      jest.spyOn(miner as any, 'mineBlock').mockImplementation(() => {});
      
      // Create a mock previous block
      const previousBlock: Block = {
        header: {
          transactionHash: 'test-tx-hash',
          timestamp: Date.now(),
          previousHeaderHash: 'test-previous-hash',
          ceiling: parseInt(SimulatorConfig.CEILING, 16),
          nonce: 0,
          height: 0
        },
        transactions: [],
        hash: 'test-hash'
      };
      
      await miner.startMining(previousBlock);
      
      expect(miner.getIsMining()).toBe(true);
      expect((miner as any).mineBlock).toHaveBeenCalled();
    });
    
    it('should not start mining if already mining', async () => {
      // Mock the mining process to avoid actual computation
      jest.spyOn(miner as any, 'mineBlock').mockImplementation(() => {});
      
      // Create a mock previous block
      const previousBlock: Block = {
        header: {
          transactionHash: 'test-tx-hash',
          timestamp: Date.now(),
          previousHeaderHash: 'test-previous-hash',
          ceiling: parseInt(SimulatorConfig.CEILING, 16),
          nonce: 0,
          height: 0
        },
        transactions: [],
        hash: 'test-hash'
      };
      
      // Set mining to true
      (miner as any).isMining = true;
      
      // Try to start mining again
      await miner.startMining(previousBlock);
      
      // Should not call mineBlock again
      expect((miner as any).mineBlock).not.toHaveBeenCalled();
    });
  });
  
  describe('stopMining', () => {
    it('should stop the mining process', () => {
      // Mock the mining process to avoid actual computation
      jest.spyOn(miner as any, 'mineBlock').mockImplementation(() => {});
      
      // Create a mock previous block
      const previousBlock: Block = {
        header: {
          transactionHash: 'test-tx-hash',
          timestamp: Date.now(),
          previousHeaderHash: 'test-previous-hash',
          ceiling: parseInt(SimulatorConfig.CEILING, 16),
          nonce: 0,
          height: 0
        },
        transactions: [],
        hash: 'test-hash'
      };
      
      // Start mining
      miner.startMining(previousBlock);
      
      // Stop mining
      miner.stopMining();
      
      expect(miner.getIsMining()).toBe(false);
    });
  });
  
  describe('handleMinedBlock', () => {
    it('should process a successfully mined block', () => {
      // Create a mock block
      const block: Block = {
        header: {
          transactionHash: 'test-tx-hash',
          timestamp: Date.now(),
          previousHeaderHash: 'test-previous-hash',
          ceiling: parseInt(SimulatorConfig.CEILING, 16),
          nonce: 123,
          height: 1
        },
        transactions: [],
        hash: 'test-block-hash'
      };
      
      // Set mining to true so we can verify it's set to false
      (miner as any).isMining = true;
      
      // Handle the mined block
      (miner as any).handleMinedBlock(block);
      
      // Should call the callback
      expect(blockMinedCallback).toHaveBeenCalledWith(block);
      
      // Should stop mining
      expect(miner.getIsMining()).toBe(false);
    });
  });
  
  describe('mineBlock', () => {
    it('should find a valid block hash', () => {
      // Mock the hash calculation to return a valid hash on the first try
      jest.spyOn(global, 'setTimeout').mockImplementation((callback) => {
        if (typeof callback === 'function') callback();
        return 0 as any;
      });
      
      // Mock calculateBlockHeaderHash to return a valid hash
      const validHash = '0000000000000000000000000000000000000000000000000000000000000001';
      jest.spyOn(require('../../../core/validation/blockValidator'), 'calculateBlockHeaderHash')
        .mockReturnValue(validHash);
      
      // Mock isHashBelowCeiling to return true
      jest.spyOn(require('../../../utils/cryptoUtils'), 'isHashBelowCeiling')
        .mockReturnValue(true);
      
      // Create a mock block
      const block: Block = {
        header: {
          transactionHash: 'test-tx-hash',
          timestamp: Date.now(),
          previousHeaderHash: 'test-previous-hash',
          ceiling: parseInt(SimulatorConfig.CEILING, 16),
          nonce: 0,
          height: 1
        },
        transactions: []
      };
      
      // Set mining to true
      (miner as any).isMining = true;
      
      // Mine the block
      (miner as any).mineBlock(block, 'test-previous-hash');
      
      // Should have called handleMinedBlock with the block
      expect(blockMinedCallback).toHaveBeenCalledWith({
        ...block,
        hash: validHash
      });
      
      // Restore mocks
      jest.restoreAllMocks();
    });
    
    it('should stop mining if previous block changes', () => {
      // Mock setTimeout to execute callback immediately
      jest.spyOn(global, 'setTimeout').mockImplementation((callback) => {
        if (typeof callback === 'function') callback();
        return 0 as any;
      });
      
      // Mock isHashBelowCeiling to return false (no valid hash found)
      jest.spyOn(require('../../../utils/cryptoUtils'), 'isHashBelowCeiling')
        .mockReturnValue(false);
      
      // Create a mock block with a different previous hash than expected
      const block: Block = {
        header: {
          transactionHash: 'test-tx-hash',
          timestamp: Date.now(),
          previousHeaderHash: 'actual-previous-hash', // Different from expected
          ceiling: parseInt(SimulatorConfig.CEILING, 16),
          nonce: 0,
          height: 1
        },
        transactions: []
      };
      
      // Set mining to true
      (miner as any).isMining = true;
      
      // Spy on stopMining
      const stopMiningSpy = jest.spyOn(miner, 'stopMining');
      
      // Mine the block with a different expected previous hash
      (miner as any).mineBlock(block, 'expected-previous-hash');
      
      // Should have called stopMining
      expect(stopMiningSpy).toHaveBeenCalled();
      
      // Restore mocks
      jest.restoreAllMocks();
    });
  });
});

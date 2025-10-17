import { createCoinbaseTransaction, createRedistributionTransaction } from '../../../core/blockchain/transaction';
import { SimulatorConfig } from '../../../config/config';
import { PeerInfoMap } from '../../../types/types';

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

// Mock noble-secp256k1 for ECDSA operations
jest.mock('noble-secp256k1', () => ({
  getPublicKey: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3])),
  sign: jest.fn().mockResolvedValue(new Uint8Array([4, 5, 6])),
  verify: jest.fn().mockResolvedValue(true)
}));

// Mock noble-hashes
jest.mock('@noble/hashes/sha256', () => ({
  sha256: jest.fn().mockImplementation(() => new Uint8Array([7, 8, 9]))
}));

jest.mock('@noble/hashes/utils', () => ({
  bytesToHex: jest.fn().mockReturnValue('mock-hex'),
  hexToBytes: jest.fn().mockReturnValue(new Uint8Array([10, 11, 12]))
}));

// Mock the cryptoUtils functions
jest.mock('../../../utils/cryptoUtils', () => ({
  generateSignature: jest.fn().mockResolvedValue('mock-signature'),
  verifySignature: jest.fn().mockResolvedValue(true),
  generateAddress: jest.fn().mockReturnValue('mock-address'),
  derivePublicKey: jest.fn().mockReturnValue('mock-public-key'),
  generatePrivateKey: jest.fn().mockReturnValue('mock-private-key'),
  sha256Hash: jest.fn().mockImplementation(data => {
    // Create a unique mock hash based on block height and other data
    const { inputs, outputs, blockHeight } = data;
    const uniqueKey = `${blockHeight}-${inputs[0].sourceOutputId}-${outputs[0].nodeId}`;
    return 'mock-hash-' + uniqueKey;
  }),
  hexToBuffer: jest.fn().mockReturnValue(Buffer.from([1, 2, 3])),
  bufferToHex: jest.fn().mockReturnValue('mock-hex')
}));

describe('Transaction Module', () => {
  describe('createCoinbaseTransaction', () => {
    it('should create a valid coinbase transaction', () => {
      const minerNodeId = 'node1';
      const blockHeight = 1;
      const minerAddress = 'node1-address';
      
      const transaction = createCoinbaseTransaction(minerNodeId, blockHeight, minerAddress);
      
      // Check structure
      expect(transaction).toBeDefined();
      expect(transaction.inputs).toHaveLength(1);
      expect(transaction.outputs).toHaveLength(1);
      expect(transaction.txid).toBeDefined();
      expect(transaction.timestamp).toBeDefined();
      
      // Check input
      expect(transaction.inputs[0].sourceOutputId).toBe(SimulatorConfig.REWARDER_NODE_ID);
      
      // Check output
      expect(transaction.outputs[0].idx).toBe(0);
      expect(transaction.outputs[0].nodeId).toBe(minerNodeId);
      expect(transaction.outputs[0].value).toBe(SimulatorConfig.BLOCK_REWARD);
    });
    
    it('should create different transactions for different block heights', () => {
      const minerNodeId = 'node1';
      const minerAddress = 'node1-address';
      
      const transaction1 = createCoinbaseTransaction(minerNodeId, 1, minerAddress);
      const transaction2 = createCoinbaseTransaction(minerNodeId, 2, minerAddress);
      
      expect(transaction1.txid).not.toBe(transaction2.txid);
    });
    
    it('should create different transactions for different miners', () => {
      const blockHeight = 1;
      
      const transaction1 = createCoinbaseTransaction('node1', blockHeight, 'node1-address');
      const transaction2 = createCoinbaseTransaction('node2', blockHeight, 'node2-address');
      
      expect(transaction1.txid).not.toBe(transaction2.txid);
      expect(transaction1.outputs[0].nodeId).toBe('node1');
      expect(transaction2.outputs[0].nodeId).toBe('node2');
    });
  });
  
  describe('createRedistributionTransaction', () => {
    // Mock peer info map
    const mockPeers: PeerInfoMap = {
      'node2': {
        address: 'node2-address',
        publicKey: 'node2-public-key'
      },
      'node3': {
        address: 'node3-address',
        publicKey: 'node3-public-key'
      }
    };
    
    it('should create a valid redistribution transaction', async () => {
      const coinbaseTxid = 'test-coinbase-txid';
      const minerNodeId = 'node1';
      const blockHeight = 1;
      const minerPrivateKey = 'mock-private-key';
      const minerPublicKey = 'mock-public-key';
      const minerAddress = 'mock-address';
      
      const transaction = await createRedistributionTransaction(
        coinbaseTxid, 
        minerNodeId, 
        blockHeight,
        minerPrivateKey,
        minerPublicKey,
        minerAddress,
        mockPeers
      );
      
      // Check structure
      expect(transaction).toBeDefined();
      expect(transaction.inputs).toHaveLength(1);
      expect(transaction.inputs[0].sourceOutputId).toBe(`${coinbaseTxid}-0`);
      expect(transaction.outputs).toHaveLength(Object.keys(mockPeers).length + 1); // Peers + change
      expect(transaction.txid).toBeDefined();
      expect(transaction.timestamp).toBeDefined();
      
      // Check security data
      expect(transaction.inputs[0].key).toBeDefined();
      expect(transaction.inputs[0].key?.publicKey).toBe(minerPublicKey);
      expect(transaction.inputs[0].key?.signature).toBe('mock-signature');
    });
    
    it('should create different transactions for different coinbase txids', async () => {
      const coinbaseTxid1 = 'test-coinbase-txid-1';
      const coinbaseTxid2 = 'test-coinbase-txid-2';
      const minerNodeId = 'node1';
      const blockHeight = 1;
      const minerPrivateKey = 'mock-private-key';
      const minerPublicKey = 'mock-public-key';
      const minerAddress = 'mock-address';
      
      const transaction1 = await createRedistributionTransaction(
        coinbaseTxid1, 
        minerNodeId, 
        blockHeight,
        minerPrivateKey,
        minerPublicKey,
        minerAddress,
        mockPeers
      );
      const transaction2 = await createRedistributionTransaction(
        coinbaseTxid2, 
        minerNodeId, 
        blockHeight,
        minerPrivateKey,
        minerPublicKey,
        minerAddress,
        mockPeers
      );
      
      expect(transaction1.txid).not.toBe(transaction2.txid);
    });
    
    it('should create different transactions for different block heights', async () => {
      const coinbaseTxid = 'test-coinbase-txid';
      const minerNodeId = 'node1';
      const minerPrivateKey = 'mock-private-key';
      const minerPublicKey = 'mock-public-key';
      const minerAddress = 'mock-address';
      
      const transaction1 = await createRedistributionTransaction(
        coinbaseTxid, 
        minerNodeId, 
        1,
        minerPrivateKey,
        minerPublicKey,
        minerAddress,
        mockPeers
      );
      const transaction2 = await createRedistributionTransaction(
        coinbaseTxid, 
        minerNodeId, 
        2,
        minerPrivateKey,
        minerPublicKey,
        minerAddress,
        mockPeers
      );
      
      expect(transaction1.txid).not.toBe(transaction2.txid);
    });
    
    it('should distribute the correct amounts to peers', async () => {
      const coinbaseTxid = 'test-coinbase-txid';
      const minerNodeId = 'node1';
      const blockHeight = 1;
      const minerPrivateKey = 'mock-private-key';
      const minerPublicKey = 'mock-public-key';
      const minerAddress = 'mock-address';
      
      const transaction = await createRedistributionTransaction(
        coinbaseTxid, 
        minerNodeId, 
        blockHeight,
        minerPrivateKey,
        minerPublicKey,
        minerAddress,
        mockPeers
      );
      
      // Calculate expected values
      const redistributionAmount = SimulatorConfig.BLOCK_REWARD * SimulatorConfig.REDISTRIBUTION_RATIO;
      const amountPerPeer = redistributionAmount / Object.keys(mockPeers).length;
      
      // Check peer outputs
      for (let i = 0; i < Object.keys(mockPeers).length; i++) {
        expect(transaction.outputs[i].nodeId).toBe(Object.keys(mockPeers)[i]);
        expect(transaction.outputs[i].value).toBeCloseTo(amountPerPeer);
      }
      
      // Check change output
      const changeOutput = transaction.outputs[Object.keys(mockPeers).length];
      expect(changeOutput.nodeId).toBe(minerNodeId);
      expect(changeOutput.value).toBeCloseTo(SimulatorConfig.BLOCK_REWARD - redistributionAmount);
    });
  });
});

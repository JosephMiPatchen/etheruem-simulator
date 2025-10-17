import { validateChain } from '../../../core/validation/chainValidator';
import { Block, BlockHeader, Transaction } from '../../../types/types';
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
  bytesToHex: jest.fn().mockReturnValue('test-hex'),
  hexToBytes: jest.fn().mockReturnValue(new Uint8Array([10, 11, 12]))
}));

// Mock cryptoUtils
jest.mock('../../../utils/cryptoUtils', () => ({
  sha256Hash: jest.fn().mockImplementation((data) => {
    // Just return a simple hash for testing
    return 'mocked-hash-' + JSON.stringify(data).length;
  }),
  isHashBelowCeiling: jest.fn().mockReturnValue(true),
  generateAddress: jest.fn().mockReturnValue('test-address'),
  derivePublicKey: jest.fn().mockReturnValue('test-public-key'),
  generatePrivateKey: jest.fn().mockReturnValue('test-private-key'),
  generateSignature: jest.fn().mockResolvedValue('test-signature'),
  verifySignature: jest.fn().mockResolvedValue(true),
  hexToBuffer: jest.fn().mockReturnValue(Buffer.from([1, 2, 3])),
  bufferToHex: jest.fn().mockReturnValue('test-hex')
}));

// Update the SimulatorConfig mock to include GENESIS_BLOCK_HASH
jest.mock('../../../config/config', () => ({
  SimulatorConfig: {
    BLOCK_REWARD: 10,
    CEILING: '0x00000fffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    NODE_COUNT: 4,
    MIN_NETWORK_DELAY_MS: 100,
    MAX_NETWORK_DELAY_MS: 1000,
    HEIGHT_CHECK_INTERVAL_MS: 5000,
    REDISTRIBUTION_RATIO: 0.5,
    REWARDER_NODE_ID: 'REWARDER',
    GENESIS_PREV_HASH: '0000000000000000000000000000000000000000000000000000000000000000',
    GENESIS_BLOCK_HASH: '0000000000000000000000000000000000000000000000000000000000000001',
    MINING_BATCH_SIZE: 1000,
    UPDATE_INTERVAL_MS: 1000
  }
}));

describe('Chain Validator', () => {
  // Helper function to create a valid block
  const createValidBlock = (
    previousHash: string, 
    height: number, 
    timestamp: number = Date.now()
  ): Block => {
    const coinbaseTx: Transaction = {
      txid: `coinbase-tx-${height}`,
      inputs: [{ sourceOutputId: SimulatorConfig.REWARDER_NODE_ID, sourceNodeId: SimulatorConfig.REWARDER_NODE_ID }],
      outputs: [{ idx: 0, nodeId: 'node1', value: SimulatorConfig.BLOCK_REWARD, lock: 'test-address-1' }],
      timestamp
    };
    
    const transactions = [coinbaseTx];
    // Create a hash for the block
    // Use the mocked sha256Hash from cryptoUtils
    const { sha256Hash } = require('../../../utils/cryptoUtils');
    const transactionHash = sha256Hash(transactions);
    
    const header: BlockHeader = {
      transactionHash,
      timestamp,
      previousHeaderHash: previousHash,
      ceiling: parseInt(SimulatorConfig.CEILING, 16),
      nonce: 123456, // Assume this produces a valid hash
      height
    };
    
    // Set the hash based on the header
    const block: Block = {
      header,
      transactions,
      hash: height === 0 ? SimulatorConfig.GENESIS_BLOCK_HASH : sha256Hash(header)
    };
    
    return block;
  };
  
  // Create a valid blockchain
  const createValidChain = (length: number): Block[] => {
    const chain: Block[] = [];
    
    // Create genesis block
    const genesisBlock = {
      header: {
        transactionHash: sha256Hash([]),
        timestamp: Date.now() - length * 10000,
        previousHeaderHash: SimulatorConfig.GENESIS_PREV_HASH,
        ceiling: parseInt(SimulatorConfig.CEILING, 16),
        nonce: 0,
        height: 0
      },
      transactions: [],
      hash: SimulatorConfig.GENESIS_BLOCK_HASH
    };
    chain.push(genesisBlock);
    
    // Create subsequent blocks
    for (let i = 1; i < length; i++) {
      const previousBlock = chain[i - 1];
      const block = createValidBlock(
        previousBlock.hash!, 
        i, 
        previousBlock.header.timestamp + 10000 // 10 seconds later
      );
      chain.push(block);
    }
    
    return chain;
  };

  it('should validate a valid blockchain', async () => {
    const chain = createValidChain(3); // Chain with 3 blocks
    
    const result = await validateChain(chain);
    expect(result).toBe(true);
  });

  it('should validate a blockchain with only genesis block', async () => {
    const chain = createValidChain(1); // Chain with just genesis block
    
    const result = await validateChain(chain);
    expect(result).toBe(true);
  });

  it('should reject an empty blockchain', async () => {
    const chain: Block[] = [];
    
    const result = await validateChain(chain);
    expect(result).toBe(false);
  });

  it('should reject a blockchain with invalid block height sequence', async () => {
    const chain = createValidChain(3);
    chain[1].header.height = 5; // Invalid height (should be 1)
    
    const result = await validateChain(chain);
    expect(result).toBe(false);
  });

  it('should reject a blockchain with invalid previous hash reference', async () => {
    const chain = createValidChain(3);
    chain[2].header.previousHeaderHash = 'invalid-previous-hash'; // Breaks the chain
    
    const result = await validateChain(chain);
    expect(result).toBe(false);
  });

  it('should reject a blockchain with non-chronological timestamps', async () => {
    const chain = createValidChain(3);
    chain[2].header.timestamp = chain[1].header.timestamp - 1000; // Earlier than previous block
    
    const result = await validateChain(chain);
    expect(result).toBe(false);
  });

  it('should reject a blockchain with invalid genesis block', async () => {
    const chain = createValidChain(3);
    chain[0].header.previousHeaderHash = 'invalid-genesis-hash'; // Should be GENESIS_BLOCK_HASH
    
    const result = await validateChain(chain);
    expect(result).toBe(false);
  });

  it('should reject a blockchain with invalid genesis block height', async () => {
    const chain = createValidChain(3);
    chain[0].header.height = 1; // Genesis block should have height 0
    
    const result = await validateChain(chain);
    expect(result).toBe(false);
  });
});

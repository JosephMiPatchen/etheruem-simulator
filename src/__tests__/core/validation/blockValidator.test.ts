import { validateBlock } from '../../../core/validation/blockValidator';

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
import { Block, BlockHeader, Transaction, UTXOSet } from '../../../types/types';
import { SimulatorConfig } from '../../../config/config';
import * as cryptoUtils from '../../../utils/cryptoUtils';

// Jest mocks need to be defined before imports
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

// Mock the transaction validator to accept our mock transaction IDs
jest.mock('../../../core/validation/transactionValidator', () => ({
  validateTransaction: jest.fn().mockReturnValue(true),
  calculateTxid: jest.fn().mockImplementation((inputs, _outputs, height) => {
    if (inputs[0].sourceOutputId === 'REWARDER') {
      return 'coinbase-tx-' + height;
    }
    return 'regular-tx-' + height;
  })
}));

// Define a constant for the genesis block hash to use in tests
const MOCK_GENESIS_BLOCK_HASH = '0000000000000000000000000000000000000000000000000000000000000001';

// Mock the hash validation functions to make testing easier
// Suppress unused variable warnings

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

jest.mock('../../../utils/cryptoUtils', () => {
  return {
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
  };
});

describe('Block Validator', () => {
  // Mock console.error to suppress expected validation error messages
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    originalConsoleError = console.error;
    console.error = jest.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  // Mock data for testing
  const mockUtxoSet: UTXOSet = {
    'tx1-0': {
      idx: 0,
      nodeId: 'node1',
      value: 10,
      lock: 'test-address'
    }
  };

  // Create transactions with mock txids
  const coinbaseInputs = [{ sourceOutputId: SimulatorConfig.REWARDER_NODE_ID, sourceNodeId: SimulatorConfig.REWARDER_NODE_ID }];
  const coinbaseOutputs = [{ idx: 0, nodeId: 'node1', value: SimulatorConfig.BLOCK_REWARD, lock: 'test-address-1' }];
  const coinbaseTxid = 'coinbase-tx-1'; // Mock txid
  
  const validCoinbaseTx: Transaction = {
    txid: coinbaseTxid,
    inputs: coinbaseInputs,
    outputs: coinbaseOutputs,
    timestamp: Date.now()
  };

  const regularInputs = [{ sourceOutputId: 'tx1-0', sourceNodeId: 'node1' }];
  const regularOutputs = [
    { idx: 0, nodeId: 'node2', value: 5, lock: 'test-address-2' },
    { idx: 1, nodeId: 'node1', value: 5, lock: 'test-address-3' }
  ];
  const regularTxid = 'regular-tx-1'; // Mock txid
  
  const validRegularTx: Transaction = {
    txid: regularTxid,
    inputs: regularInputs,
    outputs: regularOutputs,
    timestamp: Date.now()
  };

  const createValidBlock = (previousHash: string, height: number): Block => {
    const transactions = [validCoinbaseTx, validRegularTx];
    // Use the same hash calculation as the actual code
    const transactionHash = cryptoUtils.sha256Hash(transactions);
    
    const header: BlockHeader = {
      transactionHash,
      timestamp: Date.now(),
      previousHeaderHash: previousHash,
      ceiling: parseInt(SimulatorConfig.CEILING, 16),
      nonce: 123456, // Assume this produces a valid hash
      height
    };
    
    // Calculate the actual hash from the header
    const hash = cryptoUtils.sha256Hash(header);
    
    return {
      header,
      transactions,
      hash
    };
  };

  it('should validate a valid block', async () => {
    // Create a mock previous block
    const previousBlock: Block = {
      header: {
        transactionHash: cryptoUtils.sha256Hash([validCoinbaseTx]),
        timestamp: Date.now() - 10000,
        previousHeaderHash: MOCK_GENESIS_BLOCK_HASH,
        ceiling: parseInt(SimulatorConfig.CEILING, 16),
        nonce: 0,
        height: 0
      },
      transactions: [validCoinbaseTx],
      hash: ''
    };
    
    // Set the hash based on the header
    previousBlock.hash = cryptoUtils.sha256Hash(previousBlock.header);
    
    // Create a valid block with the correct previous hash
    const block = createValidBlock(previousBlock.hash, 1);
    
    const result = await validateBlock(block, mockUtxoSet, previousBlock.hash);
    expect(result).toBe(true);
  });

  it('should reject a block with invalid previous hash', async () => {
    // Create a mock previous block
    const previousBlock: Block = {
      header: {
        transactionHash: cryptoUtils.sha256Hash([validCoinbaseTx]),
        timestamp: Date.now() - 10000,
        previousHeaderHash: MOCK_GENESIS_BLOCK_HASH,
        ceiling: parseInt(SimulatorConfig.CEILING, 16),
        nonce: 0,
        height: 0
      },
      transactions: [validCoinbaseTx],
      hash: ''
    };
    
    // Set the hash based on the header
    previousBlock.hash = cryptoUtils.sha256Hash(previousBlock.header);
    
    // Create a block with an invalid previous hash
    const block = createValidBlock('invalid-previous-hash', 1);
    
    const result = await validateBlock(block, mockUtxoSet, previousBlock.hash);
    expect(result).toBe(false);
  });

  it('should reject a block with no transactions', async () => {
    // Create a mock previous block
    const previousBlock: Block = {
      header: {
        transactionHash: cryptoUtils.sha256Hash([validCoinbaseTx]),
        timestamp: Date.now() - 10000,
        previousHeaderHash: MOCK_GENESIS_BLOCK_HASH,
        ceiling: parseInt(SimulatorConfig.CEILING, 16),
        nonce: 0,
        height: 0
      },
      transactions: [validCoinbaseTx],
      hash: ''
    };
    
    // Set the hash based on the header
    previousBlock.hash = cryptoUtils.sha256Hash(previousBlock.header);
    
    // Create a block with no transactions
    const block = createValidBlock(previousBlock.hash, 1);
    block.transactions = [];
    
    const result = await validateBlock(block, mockUtxoSet, previousBlock.hash);
    expect(result).toBe(false);
  });

  it('should reject a block with no coinbase transaction', async () => {
    // Create a mock previous block
    const previousBlock: Block = {
      header: {
        transactionHash: cryptoUtils.sha256Hash([validCoinbaseTx]),
        timestamp: Date.now() - 10000,
        previousHeaderHash: MOCK_GENESIS_BLOCK_HASH,
        ceiling: parseInt(SimulatorConfig.CEILING, 16),
        nonce: 0,
        height: 0
      },
      transactions: [validCoinbaseTx],
      hash: ''
    };
    
    // Set the hash based on the header
    previousBlock.hash = cryptoUtils.sha256Hash(previousBlock.header);
    
    // Create a block with no coinbase transaction
    const block = createValidBlock(previousBlock.hash, 1);
    block.transactions = [validRegularTx]; // Missing coinbase transaction
    
    const result = await validateBlock(block, mockUtxoSet, previousBlock.hash);
    expect(result).toBe(false);
  });

  it('should reject a block with invalid coinbase transaction', async () => {
    // Create a mock previous block
    const previousBlock: Block = {
      header: {
        transactionHash: cryptoUtils.sha256Hash([validCoinbaseTx]),
        timestamp: Date.now() - 10000,
        previousHeaderHash: MOCK_GENESIS_BLOCK_HASH,
        ceiling: parseInt(SimulatorConfig.CEILING, 16),
        nonce: 0,
        height: 0
      },
      transactions: [validCoinbaseTx],
      hash: ''
    };
    
    // Set the hash based on the header
    previousBlock.hash = cryptoUtils.sha256Hash(previousBlock.header);
    
    // Create a block with an invalid coinbase transaction (wrong reward)
    const invalidCoinbaseOutputs = [{ idx: 0, nodeId: 'node1', value: SimulatorConfig.BLOCK_REWARD + 5, lock: 'test-address-1' }];
    const invalidCoinbaseTxid = 'invalid-coinbase-tx-1'; // Mock txid
    
    const invalidCoinbaseTx: Transaction = {
      txid: invalidCoinbaseTxid,
      inputs: coinbaseInputs,
      outputs: invalidCoinbaseOutputs,
      timestamp: Date.now()
    };
    
    const block = createValidBlock(previousBlock.hash, 1);
    block.transactions = [invalidCoinbaseTx, validRegularTx];
    
    const result = await validateBlock(block, mockUtxoSet, previousBlock.hash);
    expect(result).toBe(false);
  });

  it('should reject a block with invalid transaction hash', async () => {
    // Create a mock previous block
    const previousBlock: Block = {
      header: {
        transactionHash: cryptoUtils.sha256Hash([validCoinbaseTx]),
        timestamp: Date.now() - 10000,
        previousHeaderHash: MOCK_GENESIS_BLOCK_HASH,
        ceiling: parseInt(SimulatorConfig.CEILING, 16),
        nonce: 0,
        height: 0
      },
      transactions: [validCoinbaseTx],
      hash: ''
    };
    
    // Set the hash based on the header
    previousBlock.hash = cryptoUtils.sha256Hash(previousBlock.header);
    
    // Create a block with an invalid transaction hash
    const block = createValidBlock(previousBlock.hash, 1);
    block.header.transactionHash = 'invalid-transaction-hash';
    
    const result = await validateBlock(block, mockUtxoSet, previousBlock.hash);
    expect(result).toBe(false);
  });

  it('should reject a block with hash above ceiling', async () => {
    // Create a mock previous block
    const previousBlock: Block = {
      header: {
        transactionHash: cryptoUtils.sha256Hash([validCoinbaseTx]),
        timestamp: Date.now() - 10000,
        previousHeaderHash: MOCK_GENESIS_BLOCK_HASH,
        ceiling: parseInt(SimulatorConfig.CEILING, 16),
        nonce: 0,
        height: 0
      },
      transactions: [validCoinbaseTx],
      hash: ''
    };
    
    // Set the hash based on the header
    previousBlock.hash = cryptoUtils.sha256Hash(previousBlock.header);
    
    // Create a block with a hash above ceiling
    const block = createValidBlock(previousBlock.hash, 1);
    
    // Temporarily override the mock to return false for this test
    (cryptoUtils.isHashBelowCeiling as jest.Mock).mockReturnValueOnce(false);
    
    const result = await validateBlock(block, mockUtxoSet, previousBlock.hash);
    
    expect(result).toBe(false);
  });

  it('should reject a block with future timestamp', async () => {
    // Create a mock previous block
    const previousBlock: Block = {
      header: {
        transactionHash: cryptoUtils.sha256Hash([validCoinbaseTx]),
        timestamp: Date.now() - 10000,
        previousHeaderHash: MOCK_GENESIS_BLOCK_HASH,
        ceiling: parseInt(SimulatorConfig.CEILING, 16),
        nonce: 0,
        height: 0
      },
      transactions: [validCoinbaseTx],
      hash: ''
    };
    
    // Set the hash based on the header
    previousBlock.hash = cryptoUtils.sha256Hash(previousBlock.header);
    
    // Create a block with a future timestamp
    const block = createValidBlock(previousBlock.hash, 1);
    
    // Set timestamp to 3 hours in the future (beyond the 2-hour limit)
    const threeHoursInMs = 3 * 60 * 60 * 1000;
    const futureTime = Date.now() + threeHoursInMs;
    block.header.timestamp = futureTime;
    
    // Mock Date.now to return a consistent value
    const originalDateNow = Date.now;
    Date.now = jest.fn(() => futureTime - threeHoursInMs);
    
    const result = await validateBlock(block, mockUtxoSet, previousBlock.hash);
    
    // Restore original Date.now
    Date.now = originalDateNow;
    
    expect(result).toBe(false);
  });

  it('should reject a block with invalid transactions', async () => {
    // Create a mock previous block
    const previousBlock: Block = {
      header: {
        transactionHash: cryptoUtils.sha256Hash([validCoinbaseTx]),
        timestamp: Date.now() - 10000,
        previousHeaderHash: MOCK_GENESIS_BLOCK_HASH,
        ceiling: parseInt(SimulatorConfig.CEILING, 16),
        nonce: 0,
        height: 0
      },
      transactions: [validCoinbaseTx],
      hash: ''
    };
    
    // Set the hash based on the header
    previousBlock.hash = cryptoUtils.sha256Hash(previousBlock.header);
    
    // Create an invalid regular transaction (output exceeds input)
    const invalidRegularOutputs = [{ idx: 0, nodeId: 'node2', value: 15, lock: 'test-address-2' }]; // Total exceeds input value of 10
    
    const invalidRegularTx: Transaction = {
      inputs: [{ sourceOutputId: 'tx1-0', sourceNodeId: 'node1' }],
      outputs: invalidRegularOutputs,
      timestamp: Date.now(),
      txid: 'invalid-tx'
    };
    
    // Create a block with an invalid transaction
    const invalidTransactionBlock = createValidBlock(previousBlock.hash, 2);
    invalidTransactionBlock.transactions.push(invalidRegularTx);
    
    // Fix any remaining transaction outputs in the block to include lock field
    invalidTransactionBlock.transactions.forEach(tx => {
      tx.outputs.forEach(output => {
        if (!output.lock) {
          output.lock = `test-address-${output.nodeId}`;
        }
      });
    });
    
    const result = await validateBlock(invalidTransactionBlock, mockUtxoSet, previousBlock.hash);
    expect(result).toBe(false);
  });
});

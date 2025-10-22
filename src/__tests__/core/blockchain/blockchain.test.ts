import { Blockchain } from '../../../core/blockchain/blockchain';

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
import { Block, EthereumTransaction } from '../../../types/types';
import { SimulatorConfig } from '../../../config/config';
import * as blockValidator from '../../../core/validation/blockValidator';
import * as chainValidator from '../../../core/validation/chainValidator';

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
  sha256Hash: jest.fn().mockImplementation(data => 'mock-hash-' + JSON.stringify(data).length),
  isHashBelowCeiling: jest.fn().mockReturnValue(true),
  generateAddress: jest.fn().mockReturnValue('test-address'),
  derivePublicKey: jest.fn().mockReturnValue('test-public-key'),
  generatePrivateKey: jest.fn().mockReturnValue('test-private-key'),
  generateSignature: jest.fn().mockResolvedValue('test-signature'),
  verifySignature: jest.fn().mockResolvedValue(true),
  hexToBuffer: jest.fn().mockReturnValue(Buffer.from([1, 2, 3])),
  bufferToHex: jest.fn().mockReturnValue('test-hex')
}));

// Helper function to create a valid block
function createValidNextBlock(blockchain: Blockchain): Block {
  // Get the latest block from the blockchain
  const latestBlock = blockchain.getLatestBlock();
  
  const coinbaseTx: EthereumTransaction = {
    from: SimulatorConfig.REWARDER_NODE_ID,
    to: 'test-miner-address',
    value: SimulatorConfig.BLOCK_REWARD,
    nonce: 0,
    publicKey: 'test-public-key',
    signature: 'test-signature',
    timestamp: Date.now(),
    txid: 'test-coinbase-txid'
  };
  
  // Create the block with transactions
  const transactions = [coinbaseTx];
  
  // Calculate the actual transaction hash
  const transactionHash = blockValidator.calculateTransactionHash(transactions);
  
  const block = {
    header: {
      height: latestBlock.header.height + 1,
      previousHeaderHash: latestBlock.hash || '',
      timestamp: Date.now(),
      nonce: 0,
      ceiling: parseInt(SimulatorConfig.CEILING, 16),
      transactionHash: transactionHash // Use the calculated hash
    },
    transactions: transactions,
    hash: '0000000000000000000000000000000000000000000000000000000000000001' // Valid hash below ceiling
  };
  
  return block;
}

describe('Blockchain Module', () => {
  let blockchain: Blockchain;
  
  beforeEach(() => {
    blockchain = new Blockchain('test-node');
  });
  
  describe('initialization', () => {
    it('should initialize with a genesis block', () => {
      expect(blockchain.getBlocks().length).toBe(1);
      expect(blockchain.getBlocks()[0].header.height).toBe(0);
      expect(blockchain.getBlocks()[0].header.previousHeaderHash).toBe(SimulatorConfig.GENESIS_PREV_HASH);
    });
    
    it('should initialize with a world state containing miner account with genesis reward', () => {
      const worldState = blockchain.getWorldState();
      const genesisBlock = blockchain.getBlocks()[0];
      const minerAddress = genesisBlock.transactions[0].to;
      
      // The world state should contain the miner's account with the block reward
      expect(worldState[minerAddress]).toBeDefined();
      expect(worldState[minerAddress].balance).toBe(SimulatorConfig.BLOCK_REWARD);
      expect(worldState[minerAddress].nonce).toBe(0);
    });
  });
  
  describe('addBlock', () => {
    
    it('should add a valid block to the chain', async () => {
      const initialChainLength = blockchain.getBlocks().length;
      const newBlock = createValidNextBlock(blockchain);
      
      // Mock the validation function to return true
      jest.spyOn(blockValidator, 'validateBlock').mockResolvedValue(true);
      
      const result = await blockchain.addBlock(newBlock);
      
      expect(result).toBe(true);
      expect(blockchain.getBlocks().length).toBe(initialChainLength + 1);
      expect(blockchain.getBlocks()[initialChainLength]).toEqual(newBlock);
    });
    
    it('should update the world state when adding a block', async () => {
      const newBlock = createValidNextBlock(blockchain);
      
      // Mock the validation function to return true
      jest.spyOn(blockValidator, 'validateBlock').mockResolvedValue(true);
      
      const initialWorldStateSize = Object.keys(blockchain.getWorldState()).length;
      
      await blockchain.addBlock(newBlock);
      
      const updatedWorldStateSize = Object.keys(blockchain.getWorldState()).length;
      const minerAddress = newBlock.transactions[0].to;
      
      // The world state should have the miner's account with the block reward
      expect(updatedWorldStateSize).toBeGreaterThanOrEqual(initialWorldStateSize);
      expect(blockchain.getWorldState()[minerAddress]).toBeDefined();
      expect(blockchain.getWorldState()[minerAddress].balance).toBeGreaterThanOrEqual(SimulatorConfig.BLOCK_REWARD);
    });
    
    it('should reject a block with invalid height', async () => {
      const newBlock = createValidNextBlock(blockchain);
      newBlock.header.height = 5; // Invalid height
      
      // Reset the mock to allow actual validation
      jest.spyOn(blockValidator, 'validateBlock').mockRestore();
      
      const result = await blockchain.addBlock(newBlock);
      
      expect(result).toBe(false);
      expect(blockchain.getBlocks().length).toBe(1); // Still only genesis block
    });
    
    it('should reject a block with invalid previous hash', async () => {
      const newBlock = createValidNextBlock(blockchain);
      newBlock.header.previousHeaderHash = 'invalid-previous-hash';
      
      // Reset the mock to allow actual validation
      jest.spyOn(blockValidator, 'validateBlock').mockRestore();
      
      const result = await blockchain.addBlock(newBlock);
      
      expect(result).toBe(false);
      expect(blockchain.getBlocks().length).toBe(1); // Still only genesis block
    });
  });
  
  describe('replaceChain', () => {
    it('should replace the chain with a longer valid chain', async () => {
      // Create a new blockchain with a longer chain
      const longerChain = new Blockchain('test-node-2');
      
      // Add a block to make it longer
      const newBlock = createValidNextBlock(longerChain);
      
      // Mock the validation function to return true
      jest.spyOn(blockValidator, 'validateBlock').mockResolvedValue(true);
      
      await longerChain.addBlock(newBlock);
      
      // Verify the longer chain is indeed longer
      expect(longerChain.getBlocks().length).toBe(2);
      
      // Mock the validation function for the original blockchain
      jest.spyOn(chainValidator, 'validateChain').mockResolvedValue(true);
      
      // Replace the chain
      const result = await blockchain.replaceChain(longerChain.getBlocks());
      
      expect(result).toBe(true);
      expect(blockchain.getBlocks().length).toBe(2);
      expect(blockchain.getBlocks()[1].hash).toBe(newBlock.hash);
    });
    
    it('should not replace the chain with a shorter chain', async () => {
      // Add a block to the original blockchain to make it longer
      const newBlock = createValidNextBlock(blockchain);
      
      // Mock the validation function to return true
      jest.spyOn(blockValidator, 'validateBlock').mockResolvedValue(true);
      
      await blockchain.addBlock(newBlock);
      
      // Create a new blockchain with just the genesis block
      const shorterChain = new Blockchain('test-node-3');
      
      // Replace the chain
      const result = await blockchain.replaceChain(shorterChain.getBlocks());
      
      expect(result).toBe(false);
      expect(blockchain.getBlocks().length).toBe(2); // Original chain unchanged
    });
    
    it('should not replace the chain with an invalid chain', async () => {
      // Create a new blockchain with a longer but invalid chain
      const invalidChain = new Blockchain('test-node-4');
      
      // Add a block to make it longer
      const newBlock = createValidNextBlock(invalidChain);
      
      // Mock the validation function to return true for adding
      jest.spyOn(blockValidator, 'validateBlock').mockResolvedValue(true);
      
      await invalidChain.addBlock(newBlock);
      
      // Mock the chain validation function to return false for validation during replacement
      jest.spyOn(chainValidator, 'validateChain').mockResolvedValue(false);
      
      // Replace the chain
      const result = await blockchain.replaceChain(invalidChain.getBlocks());
      
      expect(result).toBe(false);
      expect(blockchain.getBlocks().length).toBe(1); // Original chain unchanged
    });
    
    it('should update the world state when replacing the chain', async () => {
      // Create a new blockchain with a longer chain
      const longerChain = new Blockchain('test-node-2');
      
      // Add a block to make it longer
      const newBlock = createValidNextBlock(longerChain);
      
      // Mock the validation function to return true
      jest.spyOn(blockValidator, 'validateBlock').mockResolvedValue(true);
      
      await longerChain.addBlock(newBlock);
      
      // Get the world state from the longer chain
      const longerChainUtxo = longerChain.getWorldState();
      
      // Mock the validation function for the original blockchain
      jest.spyOn(blockchain as any, 'isValidChain').mockResolvedValue(true);
      
      // Replace the chain
      await blockchain.replaceChain(longerChain.getBlocks());
      
      // The world state should be updated to match the longer chain
      expect(blockchain.getWorldState()).toEqual(longerChainUtxo);
    });
  });
  
  // This duplicate helper function is removed to avoid confusion
});

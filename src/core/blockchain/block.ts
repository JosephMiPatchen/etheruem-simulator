import { Block, BlockHeader, Transaction } from '../../types/types';
import { SimulatorConfig } from '../../config/config';
import { calculateTransactionHash, calculateBlockHeaderHash } from '../validation/blockValidator';



/**
 * Creates a new block template ready for mining
 */
export const createBlockTemplate = (
  previousBlock: Block | null,
  transactions: Transaction[]
): Block => {
  const height = previousBlock ? previousBlock.header.height + 1 : 0;
  const previousHeaderHash = previousBlock ? previousBlock.hash! : SimulatorConfig.GENESIS_PREV_HASH;
  
  const header: BlockHeader = {
    transactionHash: calculateTransactionHash(transactions),
    timestamp: Date.now(),
    previousHeaderHash,
    ceiling: parseInt(SimulatorConfig.CEILING, 16),
    nonce: 0,
    height
  };
  
  // Calculate an initial hash for the block header
  // Note: This is not a mined hash, just a placeholder that will be replaced during mining
  const initialHash = calculateBlockHeaderHash(header);
  
  return {
    header,
    transactions,
    hash: initialHash
  };
};

/**
 * Creates a simple coinbase transaction for the genesis block
 * This avoids circular dependencies with the transaction module
 */
const createGenesisCoinbaseTransaction = (minerNodeId: string, minerAddress: string): Transaction => {
  // Use the actual miner address passed from the node
  // This ensures consistency with the node's real Bitcoin address
  
  return {
    inputs: [{ sourceOutputId: SimulatorConfig.REWARDER_NODE_ID }],
    outputs: [{ 
      idx: 0, 
      nodeId: minerNodeId, 
      value: SimulatorConfig.BLOCK_REWARD,
      lock: minerAddress // Add lock field for consistency with other transactions even tho this wont be verified
    }],
    timestamp: Date.now(),
    txid: 'genesis-coinbase-transaction' // Simple fixed ID for genesis block
  };
};

/**
 * Creates the genesis block
 * @param minerNodeId ID of the miner node
 * @param minerAddress Bitcoin address of the miner node
 */
export const createGenesisBlock = (minerNodeId: string, minerAddress: string): Block => {
  // Create a simple coinbase transaction for the genesis block
  const coinbaseTransaction = createGenesisCoinbaseTransaction(minerNodeId, minerAddress);
  const transactions = [coinbaseTransaction];
  
  const block = createBlockTemplate(null, transactions);
  
  // Calculate the actual hash of the genesis block header
  // This ensures each node has a unique genesis block hash based on its coinbase transaction
  block.hash = calculateBlockHeaderHash(block.header);
  
  return block;
};

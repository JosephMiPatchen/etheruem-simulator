import { Block, BlockHeader, EthereumTransaction } from '../../types/types';
import { SimulatorConfig } from '../../config/config';
import { calculateTransactionHash, calculateBlockHeaderHash } from '../validation/blockValidator';
import { createCoinbaseTransaction } from './transaction';

/**
 * Creates a new block template ready for mining
 */
export const createBlockTemplate = (
  previousBlock: Block | null,
  transactions: EthereumTransaction[]
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
 * Creates the genesis block
 * @param minerNodeId ID of the miner node (not used in Ethereum, kept for compatibility)
 * @param minerAddress Ethereum address of the miner node
 */
export const createGenesisBlock = (minerNodeId: string, minerAddress: string): Block => {
  // Create a coinbase transaction for the genesis block
  const coinbaseTransaction = createCoinbaseTransaction(minerAddress);
  
  // Create a special transaction to deploy the EPM contract
  // This is a genesis-only transaction that creates the contract account
  // In Ethereum, sending to 0x0 creates a new contract
  const epmDeployTransaction: EthereumTransaction = {
    from: SimulatorConfig.REWARDER_NODE_ID, // System deploys the contract
    to: '0x0', // Contract creation address
    value: 0, // No ETH transferred
    nonce: 0,
    data: 'bulbasaur.png', // Image filename for the EPM contract
    publicKey: 'genesis',
    signature: 'genesis',
    timestamp: Date.now(),
    txid: 'genesis-epm-deploy'
  };
  
  const transactions = [coinbaseTransaction, epmDeployTransaction];
  
  const block = createBlockTemplate(null, transactions);
  
  // Calculate the actual hash of the genesis block header
  // This ensures each node has a unique genesis block hash based on its coinbase transaction
  block.hash = calculateBlockHeaderHash(block.header);
  
  return block;
};

import { Block, BlockHeader, EthereumTransaction, Attestation } from '../../types/types';
import { SimulatorConfig } from '../../config/config';
import { calculateTransactionHash, calculateBlockHeaderHash } from '../validation/blockValidator';
import { createCoinbaseTransaction } from './transaction';

/**
 * Creates a new block template ready for mining
 * @param previousBlock The previous block in the chain
 * @param transactions Transactions to include in the block
 * @param attestations Attestations for the previous block (PoS consensus)
 */
export const createBlockTemplate = (
  previousBlock: Block | null,
  transactions: EthereumTransaction[],
  attestations: Attestation[] = []
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
    attestations,
    hash: initialHash
  };
};

/**
 * Creates the shared genesis block for PoS
 * All nodes have the same genesis block (no coinbase, only EPM contract deployment)
 * This ensures all nodes start with identical state and same genesis hash
 */
export const createGenesisBlock = (): Block => {
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
    timestamp: 0, // Fixed timestamp for deterministic hash
    txid: 'genesis-epm-deploy'
  };
  
  const transactions = [epmDeployTransaction];
  
  const block = createBlockTemplate(null, transactions);
  
  // Add slot 0 to genesis block header
  block.header.slot = 0;
  
  // Calculate the actual hash of the genesis block header
  // All nodes will have the same genesis block hash
  block.hash = calculateBlockHeaderHash(block.header);
  
  return block;
};

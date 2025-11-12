import { Block, BlockHeader } from '../../types/types';
import { sha256Hash, isHashBelowCeiling } from '../../utils/cryptoUtils';
import { SimulatorConfig } from '../../config/config';
import { validateTransaction } from './transactionValidator';
import { WorldState } from '../blockchain/worldState';

/**
 * Creates a block header hash by hashing the header
 */
export const calculateBlockHeaderHash = (header: BlockHeader): string => {
  return sha256Hash(header);
};

/**
 * Calculates the hash of all transactions in a block
 */
export const calculateTransactionHash = (transactions: any[]): string => {
  return sha256Hash(transactions);
};

/**
 * Validates a block against the blockchain rules
 * Returns true if valid, false otherwise
 */
export const validateBlock = async (
  block: Block, 
  worldState: WorldState,
  previousHeaderHash: string
): Promise<boolean> => {
  const { header, transactions } = block;
  
  // 1. Validate block has at least one transaction (the coinbase)
  if (transactions.length === 0) {
    console.error('Block has no transactions');
    return false;
  }
  
  // Create a temporary world state for sequential validation
  // This allows transactions within the same block to be validated in order
  const tempWorldState = new WorldState(worldState.accounts);
  
  // 2. First transaction must be a coinbase transaction
  const coinbaseValid = await validateTransaction(transactions[0], tempWorldState, true);
  if (!coinbaseValid) {
    console.error('Invalid coinbase transaction');
    return false;
  }
  
  // Update the temporary world state with the coinbase transaction
  tempWorldState.updateWithTransaction(transactions[0]);
  
  // 3. Validate all other transactions sequentially
  for (let i = 1; i < transactions.length; i++) {
    const txValid = await validateTransaction(transactions[i], tempWorldState, false);
    if (!txValid) {
      console.error(`Invalid transaction at index ${i}`);
      return false;
    }
    
    // Update the temporary world state with this transaction
    tempWorldState.updateWithTransaction(transactions[i]);
  }
  
  // 4. Validate transaction hash in header matches the hash of all transactions
  const calculatedTransactionHash = calculateTransactionHash(transactions);
  if (header.transactionHash !== calculatedTransactionHash) {
    console.error(`Transaction hash mismatch: ${header.transactionHash} !== ${calculatedTransactionHash}`);
    return false;
  }
  
  // 5. Validate previous header hash matches the provided hash
  // For non-genesis blocks, validate previous hash
  if (header.height > 0) {
    if (!previousHeaderHash) {
      console.error('Cannot validate a non-genesis block without a previous header hash');
      return false;
    }
    
    if (header.previousHeaderHash !== previousHeaderHash) {
      console.error(`Previous header hash mismatch: ${header.previousHeaderHash} !== ${previousHeaderHash}`);
      return false;
    }
  } else {
    // For genesis blocks, only validate that previous hash is the genesis prev hash
    if (header.previousHeaderHash !== SimulatorConfig.GENESIS_PREV_HASH) {
      console.error('Genesis block must have the correct previous hash');
      return false;
    }
  }
  
  // 6. Validate block height is appropriate
  // This would typically check that height is one more than previous block
  // Since we only have the previous hash, we'll assume the caller has verified this
  
  // 7. Validate block timestamp is reasonable
  const now = Date.now();
  const fiveHoursInMs = 5 * 60 * 60 * 1000;
  if (header.timestamp > now + fiveHoursInMs || header.timestamp < now - fiveHoursInMs) {
    console.error(`Block timestamp is unreasonable: ${header.timestamp}`);
    return false;
  }
  
  // 8. PoW nonce/hash validation removed - using PoS consensus now
  // Blocks are validated by validator signatures and attestations, not hash difficulty
  
  return true;
};

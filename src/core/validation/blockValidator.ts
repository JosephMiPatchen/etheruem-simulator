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
 * Returns {valid: true} if valid, {valid: false, error: string} if invalid
 */
export const validateBlock = async (
  block: Block, 
  worldState: WorldState,
  previousHeaderHash: string
): Promise<{valid: boolean; error?: string}> => {
  const { header, transactions } = block;
  
  // 1. Validate block has at least one transaction
  if (transactions.length === 0) {
    const error = 'Block has no transactions';
    console.error(error);
    return { valid: false, error };
  }
  
  // Create a temporary world state for sequential validation
  // This allows transactions within the same block to be validated in order
  const tempWorldState = new WorldState(worldState.accounts); // clone
  // todo: also create temp beacon state when we have valdition rules specific to beacon state
  
  // 2. First transaction must be a coinbase(issuance) transaction
  const coinbaseResult = await validateTransaction(transactions[0], tempWorldState, true);
  if (!coinbaseResult.valid) {
    const error = `Invalid coinbase transaction: ${coinbaseResult.error}`;
    console.error(error);
    return { valid: false, error };
  }
  
  // Update the temporary world state with the coinbase transaction
  tempWorldState.updateWithTransaction(transactions[0]);
  
  // 3. Validate all other transactions sequentially
  for (let i = 1; i < transactions.length; i++) {
    const txResult = await validateTransaction(transactions[i], tempWorldState, false);
    if (!txResult.valid) {
      const error = `Transaction ${i} failed: ${txResult.error}`;
      console.error(error);
      return { valid: false, error };
    }
    
    // Update the temporary world state with this transaction
    tempWorldState.updateWithTransaction(transactions[i]);
  }
  
  // 4. Validate transaction hash in header matches the hash of all transactions
  const calculatedTransactionHash = calculateTransactionHash(transactions);
  if (header.transactionHash !== calculatedTransactionHash) {
    const error = `Transaction hash mismatch: ${header.transactionHash} !== ${calculatedTransactionHash}`;
    console.error(error);
    return { valid: false, error };
  }
  
  // 5. Validate previous header hash matches the provided hash
  // For non-genesis blocks, validate previous hash
  if (header.height > 0) {
    if (!previousHeaderHash) {
      const error = 'Cannot validate a non-genesis block without a previous header hash';
      console.error(error);
      return { valid: false, error };
    }
    
    if (header.previousHeaderHash !== previousHeaderHash) {
      const error = `Previous header hash mismatch: ${header.previousHeaderHash} !== ${previousHeaderHash}`;
      console.error(error);
      return { valid: false, error };
    }
  }
  
  // 6. Validate block timestamp is reasonable
  const now = Date.now();
  const fiveHoursInMs = 5 * 60 * 60 * 1000;
  if (header.timestamp > now + fiveHoursInMs || header.timestamp < now - fiveHoursInMs) {
    const error = `Block timestamp is unreasonable: ${header.timestamp}`;
    console.error(error);
    return { valid: false, error };
  }
  
  // 7. Validate attestations (if any)
  if (block.attestations && block.attestations.length > 0) {
    // TODO: Add more comprehensive attestation validation:
    // - Verify attestations point to blocks in the tree
    // - Verify attestations are from registered validators
    // - Verify attestation signatures (when implemented)
    
    // For now, just check for duplicates within the block
    const attestationKeys = new Set<string>();
    for (const attestation of block.attestations) {
      const key = `${attestation.blockHash}-${attestation.validatorAddress}`;
      if (attestationKeys.has(key)) {
        const error = `Duplicate attestation in block: ${key}`;
        console.error(error);
        return { valid: false, error };
      }
      attestationKeys.add(key);
    }
  }
  
  return { valid: true };
};

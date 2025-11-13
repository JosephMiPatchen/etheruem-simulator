import { EthereumTransaction } from '../../types/types';
import { SimulatorConfig } from '../../config/config';
import { WorldState } from '../blockchain/worldState';
import { validateTransactionSecurity } from './securityValidator';

/**
 * Validates an Ethereum transaction against the world state
 * Returns true if valid, false otherwise
 */
export async function validateTransaction(
  transaction: EthereumTransaction,
  worldState: WorldState,
  isCoinbase: boolean = false
): Promise<boolean> {
  try {
    // 1. For coinbase transactions, validate they come from REWARDER
    if (isCoinbase) {
      if (transaction.from !== SimulatorConfig.PROTOCOL_NODE_ID ||
          transaction.value !== SimulatorConfig.BLOCK_REWARD) {
        console.error('Invalid coinbase transaction');
        return false;
      }
      // Skip further validation for coinbase transactions
      return true;
    }
  
    // 2. Validate sender account exists
    const senderAccount = worldState.getAccount(transaction.from);
    if (!senderAccount) {
      console.error(`Sender account not found: ${transaction.from}`);
      return false;
    }
  
    // 3. Validate sender has sufficient balance
    if (senderAccount.balance < transaction.value) {
      console.error(`Insufficient balance: ${senderAccount.balance} < ${transaction.value}`);
      return false;
    }
  
    // 4. Validate transaction value is positive
    if (transaction.value <= 0) {
      console.error(`Transaction value must be positive: ${transaction.value}`);
      return false;
    }
  
    // 5. Validate nonce matches sender's current nonce
    if (transaction.nonce !== senderAccount.nonce) {
      console.error(`Invalid nonce: expected ${senderAccount.nonce}, got ${transaction.nonce}`);
      return false;
    }
  
    // 6. Security validation: Verify signature and address
    const securityValid = await validateTransactionSecurity(transaction);
    if (!securityValid) {
      console.error('Transaction security validation failed');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error validating transaction:', error);
    return false;
  }
}

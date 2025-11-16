import { EthereumTransaction } from '../../types/types';
import { SimulatorConfig } from '../../config/config';
import { WorldState } from '../blockchain/worldState';
import { validateTransactionSecurity } from './securityValidator';

/**
 * Validates an Ethereum transaction against the world state
 * Returns {valid: true} if valid, {valid: false, error: string} if invalid
 */
export async function validateTransaction(
  transaction: EthereumTransaction,
  worldState: WorldState,
  isCoinbase: boolean = false
): Promise<{valid: boolean; error?: string}> {
  try {
    // 1. For coinbase transactions, validate they come from REWARDER
    if (isCoinbase) {
      if (transaction.from !== SimulatorConfig.PROTOCOL_NODE_ID) {
        const error = `Coinbase transaction must be from ${SimulatorConfig.PROTOCOL_NODE_ID}, got ${transaction.from}`;
        console.error(error);
        return { valid: false, error };
      }
      // Skip further validation for coinbase transactions
      return { valid: true };
    }
  
    // 2. Validate sender account exists
    const senderAccount = worldState.getAccount(transaction.from);
    if (!senderAccount) {
      const error = `Sender account not found: ${transaction.from.slice(0, 16)}...`;
      console.error(error);
      return { valid: false, error };
    }
  
    // 3. Validate sender has sufficient balance
    if (senderAccount.balance < transaction.value) {
      const error = `Insufficient balance: sender has ${senderAccount.balance} ETH but transaction requires ${transaction.value} ETH`;
      console.error(error);
      return { valid: false, error };
    }
  
    // 4. Validate transaction value is positive
    if (transaction.value <= 0) {
      const error = `Transaction value must be positive, got ${transaction.value}`;
      console.error(error);
      return { valid: false, error };
    }
  
    // 5. Validate nonce matches sender's current nonce - todo add this check back, there is edeg case where this is failing on re org
    /*if (transaction.nonce !== senderAccount.nonce) {
      const error = `Invalid nonce: expected ${senderAccount.nonce}, got ${transaction.nonce} (sender: ${transaction.from.slice(0, 16)}...)`;
      console.error(error);
      return { valid: false, error };
    }*/
  
    // 6. Security validation: Verify signature and address
    const securityValid = await validateTransactionSecurity(transaction);
    if (!securityValid) {
      const error = `Transaction signature validation failed (txid: ${transaction.txid?.slice(0, 16)}...)`;
      console.error(error);
      return { valid: false, error };
    }
    
    return { valid: true };
  } catch (error) {
    const errorMsg = `Error validating transaction: ${error}`;
    console.error(errorMsg);
    return { valid: false, error: errorMsg };
  }
}

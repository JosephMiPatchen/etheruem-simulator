import { Transaction, TransactionInput, TransactionOutput } from '../../types/types';
import { SimulatorConfig } from '../../config/config';
import { sha256Hash } from '../../utils/cryptoUtils';
import { validateTransactionSecurity } from './securityValidator';

/**
 * Creates a transaction ID by hashing the inputs, outputs, and block height
 * Block height is included to ensure uniqueness across blocks
 */
export function calculateTxid(
  inputs: TransactionInput[], 
  outputs: TransactionOutput[], 
  blockHeight: number
): string {
  return sha256Hash({ 
    inputs, 
    outputs,
    blockHeight 
  });
}

/**
 * Validates a transaction against the UTXO set and other rules
 * Returns true if valid, false otherwise
 */
export async function validateTransaction(
  transaction: Transaction, 
  utxoSet: { [key: string]: TransactionOutput },
  blockHeight: number,
  isCoinbase: boolean = false
): Promise<boolean> {
  try {
    // 1. For coinbase transactions, validate they have exactly one input with sourceOutputId = REWARDER_NODE_ID
    if (isCoinbase) {
      if (transaction.inputs.length !== 1 || 
          transaction.inputs[0].sourceOutputId !== SimulatorConfig.REWARDER_NODE_ID ||
          transaction.outputs.length !== 1 ||
          transaction.outputs[0].value !== SimulatorConfig.BLOCK_REWARD) {
        console.error('Invalid coinbase transaction');
        return false;
      }
      // Skip further validation for coinbase transactions
      return true;
    }
  
    // 2. For regular transactions, validate all inputs exist in the UTXO set
    for (const input of transaction.inputs) {
      if (!utxoSet[input.sourceOutputId]) {
        console.error(`Transaction input not found in UTXO: ${input.sourceOutputId}`);
        return false;
      }
    }
  
    // 3. Calculate total input value
    const totalInputValue = transaction.inputs.reduce((sum, input) => {
      const utxo = utxoSet[input.sourceOutputId];
      return sum + utxo.value;
    }, 0);
  
    // 4. Calculate total output value
    const totalOutputValue = transaction.outputs.reduce((sum, output) => {
      return sum + output.value;
    }, 0);
  
    // 5. Validate input value >= output value
    // Using a small epsilon to handle potential floating-point precision issues
    const EPSILON = 0.00000001; // Small tolerance value
    if (totalInputValue + EPSILON < totalOutputValue) {
      console.error(`Transaction outputs exceed inputs: ${totalOutputValue} > ${totalInputValue}`);
      return false;
    }
  
    // 6. Validate all output values are positive
    for (const output of transaction.outputs) {
      if (output.value <= 0) {
        console.error(`Transaction output has non-positive value: ${output.value}`);
        return false;
      }
    }
  
    // 7. Validate output indices are sequential starting from 0
    for (let i = 0; i < transaction.outputs.length; i++) {
      if (transaction.outputs[i].idx !== i) {
        console.error(`Transaction output index is not sequential: ${transaction.outputs[i].idx} !== ${i}`);
        return false;
      }
    }
  
    // 8. Validate transaction ID is correctly calculated
    const calculatedTxid = calculateTxid(transaction.inputs, transaction.outputs, blockHeight);
    if (transaction.txid && transaction.txid !== calculatedTxid) {
      console.error(`Transaction ID is incorrect: ${transaction.txid} !== ${calculatedTxid}`);
      return false;
    }
  
    // 9. Security validation: Verify signatures and addresses
    const securityValid = await validateTransactionSecurity(transaction, utxoSet);
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

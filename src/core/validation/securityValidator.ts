/**
 * Security validation for transactions
 * Handles signature verification and address validation
 */

import { Transaction } from '../../types/types';
import { SimulatorConfig } from '../../config/config';
import { generateAddress, verifySignature } from '../../utils/cryptoUtils';
import { createSignatureInput } from '../blockchain/transaction';

/**
 * Validates the security aspects of a transaction
 * Verifies signatures and addresses for all inputs
 * @param transaction The transaction to validate
 * @param utxoSet The current UTXO set
 * @returns True if the transaction passes all security checks, false otherwise
 */
export const validateTransactionSecurity = async (
  transaction: Transaction,
  utxoSet: { [key: string]: any }
): Promise<boolean> => {
  // Iterate through all inputs
  for (const input of transaction.inputs) {
    // 1. Skip coinbase inputs (they don't need signatures)
    if (input.sourceOutputId === SimulatorConfig.REWARDER_NODE_ID) {
      continue;
    }
    
    // 2. For non-coinbase inputs, key data is required
    if (!input.key) {
      console.error('Missing key data for transaction input');
      return false;
    }
    
    // 3. Verify the UTXO entry exists for the input's sourceOutputId
    const utxo = utxoSet[input.sourceOutputId];
    if (!utxo) {
      console.error(`UTXO entry not found for input: ${input.sourceOutputId}`);
      return false;
    }
    
    // 4. Verify that the public key hash matches the lock in the UTXO
    const derivedAddress = generateAddress(input.key.publicKey);
    if (utxo.lock && derivedAddress !== utxo.lock) {
      console.error(`Public key does not match address in UTXO: ${derivedAddress} !== ${utxo.lock}`);
      return false;
    }
    
    // 5. Verify that a signature exists
    if (!input.key.signature) {
      console.error('Missing signature for transaction input');
      return false;
    }
    
    // 6. Verify that the signature is not an error signature
    if (input.key.signature.startsWith('error-')) {
      console.error('Transaction input contains error signature');
      return false;
    }
    
    // 7. Create the signature input object using shared function
    // This ensures consistency with the signing process
    const signatureInput = createSignatureInput(
      input.sourceOutputId,
      transaction.outputs
    );
    
    // 8. Cryptographically verify ownership of the input and right to spend that BTC
    // This ensures the transaction is authorized by the rightful owner of the UTXO
    try {
      const isValid = await verifySignature(
        signatureInput, 
        input.key.signature, 
        input.key.publicKey
      );
      
      // 9. Reject if signature is invalid
      if (!isValid) {
        console.error('Invalid signature for transaction input');
        return false;
      }
    } catch (error) {
      console.error('Error verifying signature:', error);
      return false;
    }
  }
  
  return true;
};

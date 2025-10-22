/**
 * Security validation for Ethereum transactions
 * Handles signature verification and address validation
 */

import { EthereumTransaction } from '../../types/types';
import { SimulatorConfig } from '../../config/config';
import { generateAddress, verifySignature } from '../../utils/cryptoUtils';
import { createSignatureInput } from '../blockchain/transaction';

/**
 * Validates the security aspects of an Ethereum transaction
 * Verifies signature and that public key hash matches from address
 * @param transaction The transaction to validate
 * @returns True if the transaction passes all security checks, false otherwise
 */
export const validateTransactionSecurity = async (
  transaction: EthereumTransaction
): Promise<boolean> => {
  // 1. Skip coinbase transactions (they don't need signatures)
  if (transaction.from === SimulatorConfig.REWARDER_NODE_ID) {
    return true;
  }
  
  // 2. Verify public key is provided
  if (!transaction.publicKey) {
    console.error('Missing public key for transaction');
    return false;
  }
  
  // 3. Verify that the public key hash matches the from address
  const derivedAddress = generateAddress(transaction.publicKey);
  if (derivedAddress !== transaction.from) {
    console.error(`Public key does not match from address: ${derivedAddress} !== ${transaction.from}`);
    return false;
  }
  
  // 4. Verify that a signature exists
  if (!transaction.signature) {
    console.error('Missing signature for transaction');
    return false;
  }
  
  // 5. Verify that the signature is not an error signature
  if (transaction.signature.startsWith('error-')) {
    console.error('Transaction contains error signature');
    return false;
  }
  
  // 6. Create the signature input object (pass full transaction)
  const signatureInput = createSignatureInput({
    from: transaction.from,
    to: transaction.to,
    value: transaction.value,
    nonce: transaction.nonce,
    timestamp: transaction.timestamp,
    txid: transaction.txid
  });
  
  // 7. Cryptographically verify the signature
  try {
    const isValid = await verifySignature(
      signatureInput,
      transaction.signature,
      transaction.publicKey
    );
    
    // 8. Reject if signature is invalid
    if (!isValid) {
      console.error('Invalid signature for transaction');
      return false;
    }
  } catch (error) {
    console.error('Error verifying signature:', error);
    return false;
  }
  
  return true;
};

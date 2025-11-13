import { EthereumTransaction, PeerInfoMap } from '../../types/types';
import { SimulatorConfig } from '../../config/config';
import { generateSignature as cryptoGenerateSignature } from '../../utils/cryptoUtils';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

/**
 * Helper function to calculate transaction hash (txid)
 * NOTE: Does NOT include signature - txid is calculated before signing
 */
function calculateTxid(tx: Partial<EthereumTransaction>): string {
  const txString = JSON.stringify({ 
    from: tx.from, 
    to: tx.to, 
    value: tx.value, 
    nonce: tx.nonce, 
    timestamp: tx.timestamp 
  });
  return bytesToHex(sha256(new TextEncoder().encode(txString)));
}

/**
 * Creates the signature input data for an Ethereum transaction
 * 
 * CRYPTOGRAPHIC COMMITMENT PATTERN:
 * We sign JUST the txid because:
 * 1. txid = hash(from, to, value, nonce, timestamp) - cryptographically commits to all transaction data
 * 2. Signing the txid proves you authorized this specific transaction
 * 3. During validation, we verify:
 *    a) hash(transaction_data) === txid (data hasn't been tampered with)
 *    b) signature is valid for txid (proves authorization with private key)
 * 
 * This is simpler and more efficient than signing all the transaction data separately.
 */
export function createSignatureInput(tx: { txid: string }) {
  // Return just the txid - it cryptographically represents the entire transaction
  return tx.txid;
}

/**
 * Creates a coinbase transaction for the miner
 * This is the reward for mining a block
 * Note: Coinbase transactions don't need real signatures
 */
export const createCoinbaseTransaction = (
  minerAddress: string
): EthereumTransaction => {
  const timestamp = Date.now();
  
  // Calculate txid first (before signature)
  const txid = calculateTxid({
    from: SimulatorConfig.PROTOCOL_NODE_ID,
    to: minerAddress,
    value: SimulatorConfig.BLOCK_REWARD,
    nonce: 0,
    timestamp
  });
  
  return {
    from: SimulatorConfig.PROTOCOL_NODE_ID,
    to: minerAddress,
    value: SimulatorConfig.BLOCK_REWARD,
    nonce: 0,
    publicKey: '',
    signature: `coinbase-${timestamp}`,  // Placeholder signature for coinbase
    timestamp,
    txid
  };
};

/**
 * Creates peer payment transactions - one transaction per peer
 * In Ethereum account model, we send separate transactions instead of one with multiple outputs
 */
export const createPeerPaymentTransactions = async (
  minerAddress: string,
  minerNonce: number,
  minerPrivateKey: string,
  minerPublicKey: string,
  peers: PeerInfoMap
): Promise<EthereumTransaction[]> => {
  const peerNodeIds = Object.keys(peers);
  
  // Calculate redistribution amounts
  const redistributionAmount = SimulatorConfig.BLOCK_REWARD * SimulatorConfig.REDISTRIBUTION_RATIO;
  const amountPerPeer = redistributionAmount / peerNodeIds.length;
  
  const transactions: EthereumTransaction[] = [];
  
  // Create one transaction per peer
  for (let i = 0; i < peerNodeIds.length; i++) {
    const peerId = peerNodeIds[i];
    const peerAddress = peers[peerId].address;
    const timestamp = Date.now();
    
    // Step 1: Calculate txid FIRST (before signature)
    const txid = calculateTxid({
      from: minerAddress,
      to: peerAddress,
      value: amountPerPeer,
      nonce: minerNonce + i,
      timestamp
    });
    
    // Step 2: Create signature input (just the txid)
    // The txid already cryptographically commits to all transaction data
    const signatureInput = createSignatureInput({ txid });
    
    // Step 3: Generate signature (signing the txid proves authorization)
    let signature;
    try {
      signature = await cryptoGenerateSignature(signatureInput, minerPrivateKey);
    } catch (error) {
      console.error('Error generating signature:', error);
      signature = `error-${timestamp}`;
    }
    
    // Step 4: Build complete transaction
    transactions.push({
      from: minerAddress,
      to: peerAddress,
      value: amountPerPeer,
      nonce: minerNonce + i,
      publicKey: minerPublicKey,
      signature,
      timestamp,
      txid
    });
  }
  
  return transactions;
};

/**
 * Creates a signed transaction for a user-initiated transfer
 * @param from Sender address
 * @param to Recipient address
 * @param value Amount to send in ETH
 * @param nonce Sender's current nonce
 * @param privateKey Sender's private key for signing
 * @param publicKey Sender's public key
 * @returns Signed Ethereum transaction
 */
export async function createSignedTransaction(
  from: string,
  to: string,
  value: number,
  nonce: number,
  privateKey: string,
  publicKey: string
): Promise<EthereumTransaction> {
  const timestamp = Date.now();
  
  // Calculate txid first (before signature)
  const txid = calculateTxid({ from, to, value, nonce, timestamp });
  
  // Create signature input and sign
  const signatureInput = createSignatureInput({ txid });
  const signature = await cryptoGenerateSignature(signatureInput, privateKey);
  
  return {
    from,
    to,
    value,
    nonce,
    publicKey,
    signature,
    timestamp,
    txid
  };
}

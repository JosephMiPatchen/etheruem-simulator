import { EthereumTransaction, PeerInfoMap } from '../../types/types';
import { SimulatorConfig } from '../../config/config';
import { generateSignature as cryptoGenerateSignature } from '../../utils/cryptoUtils';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

/**
 * Helper function to calculate transaction hash (txid)
 */
function calculateTxid(
  from: string,
  to: string,
  value: number,
  nonce: number,
  timestamp: number,
  signature: string
): string {
  const txString = JSON.stringify({ from, to, value, nonce, timestamp, signature });
  return bytesToHex(sha256(new TextEncoder().encode(txString)));
}

/**
 * Creates the signature input data for an Ethereum transaction
 * This is what gets signed to prove authorization
 */
export function createSignatureInput(
  from: string,
  to: string,
  value: number,
  nonce: number,
  timestamp: number
) {
  return { from, to, value, nonce, timestamp };
}

/**
 * Creates a coinbase transaction for the miner
 * This is the reward for mining a block
 */
export const createCoinbaseTransaction = (
  minerAddress: string
): EthereumTransaction => {
  const timestamp = Date.now();
  const from = SimulatorConfig.REWARDER_NODE_ID;
  const to = minerAddress;
  const value = SimulatorConfig.BLOCK_REWARD;
  const nonce = 0;
  const publicKey = '';
  const signature = `coinbase-${timestamp}`;
  
  const txid = calculateTxid(from, to, value, nonce, timestamp, signature);
  
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
    const from = minerAddress;
    const to = peerAddress;
    const value = amountPerPeer;
    const nonce = minerNonce + i; // Increment nonce for each transaction
    
    // Create signature input
    const signatureInput = createSignatureInput(from, to, value, nonce, timestamp);
    
    // Generate signature
    let signature;
    try {
      signature = await cryptoGenerateSignature(signatureInput, minerPrivateKey);
    } catch (error) {
      console.error('Error generating signature:', error);
      signature = `error-${timestamp}`;
    }
    
    // Calculate txid
    const txid = calculateTxid(from, to, value, nonce, timestamp, signature);
    
    transactions.push({
      from,
      to,
      value,
      nonce,
      publicKey: minerPublicKey,
      signature,
      timestamp,
      txid
    });
  }
  
  return transactions;
};

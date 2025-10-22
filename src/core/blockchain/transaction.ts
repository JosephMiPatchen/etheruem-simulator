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
 * This is what gets signed to prove authorization (includes txid)
 */
export function createSignatureInput(tx: {
  from: string;
  to: string;
  value: number;
  nonce: number;
  timestamp: number;
  txid: string;
}) {
  return { 
    from: tx.from, 
    to: tx.to, 
    value: tx.value, 
    nonce: tx.nonce, 
    timestamp: tx.timestamp,
    txid: tx.txid
  };
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
    from: SimulatorConfig.REWARDER_NODE_ID,
    to: minerAddress,
    value: SimulatorConfig.BLOCK_REWARD,
    nonce: 0,
    timestamp
  });
  
  return {
    from: SimulatorConfig.REWARDER_NODE_ID,
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
    
    // Step 2: Create signature input (includes txid)
    const signatureInput = createSignatureInput({
      from: minerAddress,
      to: peerAddress,
      value: amountPerPeer,
      nonce: minerNonce + i,
      timestamp,
      txid
    });
    
    // Step 3: Generate signature
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

import { Transaction, TransactionInput, TransactionOutput, PeerInfoMap } from '../../types/types';
import { SimulatorConfig } from '../../config/config';
import { calculateTxid } from '../validation/transactionValidator';
import { generateSignature as cryptoGenerateSignature } from '../../utils/cryptoUtils';

/**
 * Creates the signature input data for a transaction input
 * This is used for both signing and verification to ensure consistency
 */
export function createSignatureInput(
  sourceOutputId: string,
  allOutputs: TransactionOutput[]
) {
  return {
    sourceOutputId,
    allOutputs
  };
}

/**
 * Creates a coinbase transaction for the given miner and block height
 */
export const createCoinbaseTransaction = (
  minerNodeId: string, 
  blockHeight: number,
  minerAddress: string
): Transaction => {
  const inputs = [{ 
    sourceOutputId: SimulatorConfig.REWARDER_NODE_ID,
    sourceNodeId: SimulatorConfig.REWARDER_NODE_ID
  }];
  
  const outputs = [{ 
    idx: 0, 
    nodeId: minerNodeId, 
    value: SimulatorConfig.BLOCK_REWARD,
    lock: minerAddress // Bitcoin address derived from the miner's public key
  }];
  
  return {
    inputs,
    outputs,
    timestamp: Date.now(),
    txid: calculateTxid(inputs, outputs, blockHeight)
  };
};

/**
 * Creates a transaction that redistributes a portion of the coinbase reward to peers
 */
export const createRedistributionTransaction = async (
  coinbaseTxid: string,
  minerNodeId: string, // so we can include in the input which will be needed for the UI
  blockHeight: number,
  minerPrivateKey: string, // so we can sign the inputs that we are spending
  minerPublicKey: string, // so that other nodes can verify signature and verify this is the public key of the address
  minerAddress: string, // so we can add a lock for portion of the redistribution that goes back to miner
  peers: PeerInfoMap // Map of peer IDs to their information including addresses
): Promise<Transaction> => {
  // Get peer IDs from the peers dictionary
  const peerNodeIds = Object.keys(peers);
  
  // Calculate redistribution amounts
  const redistributionAmount = SimulatorConfig.BLOCK_REWARD * SimulatorConfig.REDISTRIBUTION_RATIO;
  const amountPerPeer = redistributionAmount / peerNodeIds.length;
  
  // Create input referencing the coinbase output
  const inputs: TransactionInput[] = [{ 
    sourceOutputId: `${coinbaseTxid}-0`,
    sourceNodeId: minerNodeId // for ui
  }];
  
  // Create outputs for each peer and a change output for the miner
  const outputs: TransactionOutput[] = [
    ...peerNodeIds.map((peerId, idx) => ({
      idx,
      nodeId: peerId,
      value: amountPerPeer,
      lock: peers[peerId].address // Use the peer's address for the lock
    })),
    {
      idx: peerNodeIds.length,
      nodeId: minerNodeId,
      value: SimulatorConfig.BLOCK_REWARD - redistributionAmount,
      lock: minerAddress // Miner's Bitcoin address
    }
  ];
  
  // Create the signature input object using shared function
  const signatureInput = createSignatureInput(inputs[0].sourceOutputId, outputs);
  
  // Generate the signature using the cryptoUtils function and await the result
  // This will block until the signature is generated
  let signature;
  try {
    signature = await cryptoGenerateSignature(signatureInput, minerPrivateKey);
  } catch (error) {
    console.error('Error generating signature:', error);
    // Use a fallback signature in case of error
    signature = `error-${Date.now()}`;
  }
  
  // Add signature data to the input
  inputs[0].key = {
    publicKey: minerPublicKey,
    signature: signature
  };
  
  return {
    inputs,
    outputs,
    timestamp: Date.now(),
    txid: calculateTxid(inputs, outputs, blockHeight)
  };
};

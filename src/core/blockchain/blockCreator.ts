import { EthereumTransaction, PeerInfoMap } from '../../types/types';
import { SimulatorConfig } from '../../config/config';
import { 
  createCoinbaseTransaction, 
  createPeerPaymentTransactions,
  createSignatureInput
} from './transaction';
import { generateSignature as cryptoGenerateSignature } from '../../utils/cryptoUtils';
import { Node } from '../node';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { getNodePaintColor } from '../../utils/nodeColorUtils';
import { Mempool } from '../mempool/mempool';
import { Blockchain } from './blockchain';

/**
 * BlockCreator - Utility class for creating block transactions
 * Used by both Miner (PoW) and Consensus (PoS) classes
 * 
 * Provides static methods for:
 * - Creating block transactions (coinbase, mempool, peer payments, paint)
 * - Creating paint transactions
 * - Getting valid peers
 */
export class BlockCreator {
  // Painting complete flag - shared across all instances
  private static paintingComplete: boolean = false;
  
  /**
   * Mark painting as complete - stops creating paint transactions
   */
  public static markPaintingComplete(nodeId: string): void {
    BlockCreator.paintingComplete = true;
    console.log(`${nodeId}: Painting complete - no more paint transactions will be created`);
  }
  
  /**
   * Check if painting is complete
   */
  public static isPaintingComplete(): boolean {
    return BlockCreator.paintingComplete;
  }
  
  /**
   * Gets peers with valid addresses
   * @param node The node to get peers from
   * @returns PeerInfoMap containing only peers with valid addresses
   */
  public static getValidPeers(node: Node): PeerInfoMap {
    const peers = node.getPeerInfos();
    return Object.entries(peers).reduce((validPeers, [peerId, info]) => {
      // Only include peers that have a defined non-empty address
      if (info?.address !== undefined && info.address !== '') {
        validPeers[peerId] = { 
          address: info.address
        };
      }
      return validPeers;
    }, {} as PeerInfoMap);
  }
  
  /**
   * Creates transactions for a new block
   * Includes: coinbase, mempool transactions, peer payments, and paint transaction
   * @param node The node creating the block
   * @param blockchain The blockchain instance
   * @param mempool The mempool instance
   * @param height Block height
   * @returns Promise resolving to array of transactions for the block
   */
  public static async createBlockTransactions(
    node: Node,
    blockchain: Blockchain,
    mempool: Mempool,
    height: number
  ): Promise<EthereumTransaction[]> {
    const nodeAddress = node.getAddress();
    
    // Create coinbase transaction (block creator receives block reward)
    const coinbaseTransaction = createCoinbaseTransaction(nodeAddress);
    
    const transactions: EthereumTransaction[] = [coinbaseTransaction];
    
    // Get peers with valid addresses
    const validPeers = BlockCreator.getValidPeers(node);
    
    if (Object.keys(validPeers).length === 0) {
      console.warn('[BlockCreator] No peers with valid addresses available for peer payments');
      return transactions;
    }
    
    // Get node's current nonce from world state
    // Coinbase transactions don't increment nonce, so we use the node's current nonce
    const worldState = blockchain.getWorldState();
    const nodeAccount = worldState[nodeAddress];
    const baseNonce = nodeAccount ? nodeAccount.nonce : 0;
    
    // IMPORTANT: Add mempool transactions FIRST
    // This ensures peer payments and paint transactions use nonces that come after mempool transactions
    const maxMempoolSlots = SimulatorConfig.MAX_BLOCK_TRANSACTIONS - 1 - Object.keys(validPeers).length; // Reserve slots for coinbase, peer payments, and paint tx
    const mempoolTransactions = mempool.getTransactions(Math.max(0, maxMempoolSlots));
    transactions.push(...mempoolTransactions);
    
    // Calculate starting nonce for peer payments (after mempool transactions)
    const peerPaymentStartNonce = baseNonce + mempoolTransactions.length;
    
    // Create peer payment transactions (one per peer)
    const peerPayments = await createPeerPaymentTransactions(
      nodeAddress,
      peerPaymentStartNonce,
      node.getPrivateKey(),
      node.getPublicKey(),
      validPeers
    );
    
    // Add all peer payment transactions to the block
    transactions.push(...peerPayments);
    
    // After peer payments, create a paint transaction with remaining ETH (truncated to integer)
    const paintNonce = peerPaymentStartNonce + peerPayments.length;
    const paintTransaction = await BlockCreator.createPaintTransaction(node, blockchain, paintNonce);
    if (paintTransaction) {
      transactions.push(paintTransaction);
    }
    
    return transactions;
  }
  
  /**
   * Creates a paint transaction to send remaining ETH (truncated to integer) to EPM contract
   * @param node The node creating the transaction
   * @param blockchain The blockchain instance
   * @param nonce The nonce to use for this transaction
   * @returns Paint transaction or null if insufficient balance
   */
  public static async createPaintTransaction(
    node: Node,
    blockchain: Blockchain,
    nonce: number
  ): Promise<EthereumTransaction | null> {
    // Don't create paint transactions if painting is complete
    if (BlockCreator.paintingComplete) {
      return null;
    }
    
    const nodeAddress = node.getAddress();
    
    // Get node's current account state
    const worldState = blockchain.getWorldState();
    const nodeAccount = worldState[nodeAddress];
    
    if (!nodeAccount) return null;
    
    // Calculate how much ETH will be spent on peer payments
    const validPeers = BlockCreator.getValidPeers(node);
    const peerCount = Object.keys(validPeers).length;
    const redistributionAmount = SimulatorConfig.BLOCK_REWARD * SimulatorConfig.REDISTRIBUTION_RATIO;
    const totalPeerPayments = peerCount > 0 ? redistributionAmount : 0;
    
    // Calculate remaining balance after peer payments
    const balanceAfterPeerPayments = nodeAccount.balance - totalPeerPayments;
    
    // Calculate ETH to send (truncate to integer)
    const ethToSend = Math.floor(balanceAfterPeerPayments);
    
    // Only send if we have at least 1 ETH after peer payments
    if (ethToSend < 1) return null;
    
    const timestamp = Date.now();
    
    // Calculate txid (hash of transaction data)
    // NOTE: Must match validator's calculateTxid - does NOT include data field
    const txString = JSON.stringify({ 
      from: nodeAddress, 
      to: '0xEPM_PAINT_CONTRACT', 
      value: ethToSend, 
      nonce, 
      timestamp
    });
    const txid = bytesToHex(sha256(new TextEncoder().encode(txString)));
    
    // Create signature input (just the txid)
    const signatureInput = createSignatureInput({ txid });
    
    // Generate signature
    let signature;
    try {
      signature = await cryptoGenerateSignature(signatureInput, node.getPrivateKey());
    } catch (error) {
      console.error('[BlockCreator] Error generating signature for paint transaction:', error);
      signature = `error-${timestamp}`;
    }
    
    // Choose a deterministic color for this node based on its ID
    // This ensures each node consistently paints the same color
    const nodeId = node.getNodeId();
    const nodeColor = getNodePaintColor(nodeId);
    
    // Build complete paint transaction with color data
    return {
      from: nodeAddress,
      to: '0xEPM_PAINT_CONTRACT',
      value: ethToSend,
      nonce,
      data: JSON.stringify({ color: nodeColor }),
      publicKey: node.getPublicKey(),
      signature,
      timestamp,
      txid
    };
  }
}

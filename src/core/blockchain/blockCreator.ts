import { EthereumTransaction, PeerInfoMap, Block } from '../../types/types';
import { SimulatorConfig } from '../../config/config';
import { 
  createCoinbaseTransaction, 
  createPeerPaymentTransactions,
  createSignatureInput
} from './transaction';
import { calculateTransactionHash, calculateBlockHeaderHash } from '../validation/blockValidator';
import { generateSignature as cryptoGenerateSignature } from '../../utils/cryptoUtils';
import { Node } from '../node';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { getNodePaintColor } from '../../utils/nodeColorUtils';
import { Mempool } from '../mempool/mempool';
import { Blockchain } from './blockchain';

/**
 * BlockCreator - Utility class for creating block transactions and blocks
*Consensus (PoS) classes
 * 
 * Provides static methods for:
 * - Creating genesis block
 * - Creating block transactions (coinbase, mempool, peer payments, paint)
 * - Creating paint transactions
 * - Getting valid peers
 * 
 * Note: Painting complete flag is stored per-node in Node class,
 * not in BlockCreator (to avoid shared state across nodes)
 */
export class BlockCreator {
  
  /**
   * Creates the shared genesis block for PoS
   * All nodes have the same genesis block (no coinbase, only EPM contract deployment)
   * This ensures all nodes start with identical state and same genesis hash
   */
  public static createGenesisBlock(): any {
    // Create a special transaction to deploy the EPM contract
    // This is a genesis-only transaction that creates the contract account
    // In Ethereum, sending to 0x0 creates a new contract
    const epmDeployTransaction: EthereumTransaction = {
      from: SimulatorConfig.PROTOCOL_NODE_ID, // System deploys the contract
      to: '0x0', // Contract creation address
      value: 0, // No ETH transferred
      nonce: 0,
      data: 'bulbasaur.png', // Image filename for the EPM contract
      publicKey: 'genesis',
      signature: 'genesis',
      timestamp: 0, // Fixed timestamp for deterministic hash
      txid: 'genesis-epm-deploy'
    };
    
    const transactions = [epmDeployTransaction];
    
    // Create block header (PoS - no ceiling or nonce)
    const header = {
      transactionHash: calculateTransactionHash(transactions),
      timestamp: 0, // Fixed timestamp for deterministic genesis hash
      previousHeaderHash: SimulatorConfig.GENESIS_PREV_HASH,
      height: 0,
      slot: -1 // Genesis is at slot -1 (before slot 0)
    };
    
    // Create genesis block with RANDAO reveal
    const block = {
      header,
      transactions,
      attestations: [],
      randaoReveal: SimulatorConfig.GENESIS_RANDAO_REVEAL,
      hash: calculateBlockHeaderHash(header)
    };
    
    return block;
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
   * Create a complete PoS block ready to broadcast
   * @param node - The proposing node
   * @param blockchain - Blockchain instance
   * @param mempool - Mempool instance
   * @param slot - Slot number for this block
   * @param randaoReveal - RANDAO reveal for this block
   * @param paintingComplete - Whether painting is complete
   * @returns Complete block with header, transactions, and hash
   */
  public static async createBlock(
    node: Node,
    blockchain: Blockchain,
    mempool: Mempool,
    slot: number,
    randaoReveal: string,
    paintingComplete: boolean
  ): Promise<Block> {
    // Get latest block to build on top of
    const latestBlock = blockchain.getLatestBlock();
    if (!latestBlock) {
      throw new Error('[BlockCreator] Cannot create block: no latest block');
    }
    
    // Create all transactions for the block
    const transactions = await BlockCreator.createBlockTransactions(
      node,
      blockchain,
      mempool,
      latestBlock.header.height + 1,
      paintingComplete
    );
    
    // Create block header (PoS - no ceiling or nonce)
    const header = {
      transactionHash: calculateTransactionHash(transactions),
      timestamp: Date.now(),
      previousHeaderHash: latestBlock.hash || '',
      height: latestBlock.header.height + 1,
      slot: slot
    };
    
    // Create block with RANDAO reveal
    const block: Block = {
      header,
      transactions,
      attestations: [],
      randaoReveal: randaoReveal
    };
    
    // Compute block hash (includes slot in hash)
    block.hash = calculateBlockHeaderHash(header);
    
    return block;
  }
  
  /**
   * Creates transactions for a new block
   * Includes: coinbase, mempool transactions, peer payments, and paint transaction
   * @param node The node creating the block
   * @param blockchain The blockchain instance
   * @param mempool The mempool instance
   * @param height Block height
   * @param paintingComplete Whether painting is complete for this node
   * @returns Promise resolving to array of transactions for the block
   */
  public static async createBlockTransactions(
    node: Node,
    blockchain: Blockchain,
    mempool: Mempool,
    height: number,
    paintingComplete: boolean
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
    
    console.log(`[BlockCreator] Creating block transactions for ${nodeAddress.slice(0, 8)}: baseNonce=${baseNonce}, balance=${nodeAccount?.balance || 0}`);
    
    // IMPORTANT: Add mempool transactions FIRST
    // This ensures peer payments and paint transactions use nonces that come after mempool transactions
    const maxMempoolSlots = SimulatorConfig.MAX_BLOCK_TRANSACTIONS - 1 - Object.keys(validPeers).length; // Reserve slots for coinbase, peer payments, and paint tx
    const mempoolTransactions = mempool.getTransactions(Math.max(0, maxMempoolSlots));
    transactions.push(...mempoolTransactions);
    
    console.log(`[BlockCreator] Mempool transactions: ${mempoolTransactions.length}, peerCount: ${Object.keys(validPeers).length}`);
    
    // Calculate starting nonce for peer payments (after mempool transactions)
    const peerPaymentStartNonce = baseNonce + mempoolTransactions.length;
    console.log(`[BlockCreator] Calculating peer payment start nonce: baseNonce=${baseNonce}, mempoolTransactions.length=${mempoolTransactions.length}, peerPaymentStartNonce=${peerPaymentStartNonce}`);
    
    console.log(`[BlockCreator] Peer payment start nonce: ${peerPaymentStartNonce}`);
    
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
    const paintTransaction = await BlockCreator.createPaintTransaction(node, blockchain, paintNonce, paintingComplete);
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
   * @param paintingComplete Whether painting is complete for this node
   * @returns Paint transaction or null if insufficient balance
   */
  public static async createPaintTransaction(
    node: Node,
    blockchain: Blockchain,
    nonce: number,
    paintingComplete: boolean
  ): Promise<EthereumTransaction | null> {
    // Don't create paint transactions if painting is complete
    if (paintingComplete) {
      console.log('[BlockCreator] Painting complete, skipping paint transaction');
      return null;
    }
    
    const nodeAddress = node.getAddress();
    
    // Get node's current account state
    const worldState = blockchain.getWorldState();
    const nodeAccount = worldState[nodeAddress];
    
    if (!nodeAccount) {
      console.log(`[BlockCreator] No account found for ${nodeAddress.slice(0, 8)}, skipping paint transaction`);
      return null;
    }
    
    // Calculate how much ETH will be spent on peer payments
    const validPeers = BlockCreator.getValidPeers(node);
    const peerCount = Object.keys(validPeers).length;
    const redistributionAmount = SimulatorConfig.BLOCK_REWARD * SimulatorConfig.REDISTRIBUTION_RATIO;
    const totalPeerPayments = peerCount > 0 ? redistributionAmount : 0;
    
    // Calculate balance AFTER coinbase is applied (coinbase will be added in this block)
    const balanceAfterCoinbase = nodeAccount.balance + SimulatorConfig.BLOCK_REWARD;
    
    // Calculate remaining balance after peer payments
    const balanceAfterPeerPayments = balanceAfterCoinbase - totalPeerPayments;
    
    // Calculate ETH to send (truncate to integer)
    const ethToSend = Math.floor(balanceAfterPeerPayments);
    
    console.log(`[BlockCreator] Paint tx check for ${nodeAddress.slice(0, 8)}: currentBalance=${nodeAccount.balance}, +coinbase=${SimulatorConfig.BLOCK_REWARD}, afterCoinbase=${balanceAfterCoinbase}, -peerPayments=${totalPeerPayments}, remaining=${balanceAfterPeerPayments}, ethToSend=${ethToSend}`);
    
    // Only send if we have at least 1 ETH after peer payments
    if (ethToSend < 1) {
      console.log(`[BlockCreator] Insufficient balance for paint transaction (need at least 1 ETH, have ${ethToSend})`);
      return null;
    }
    
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

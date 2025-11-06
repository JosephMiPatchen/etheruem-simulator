import { Block, EthereumTransaction, PeerInfoMap, BlockHeader } from '../../types/types';
import { SimulatorConfig } from '../../config/config';
import { 
  createCoinbaseTransaction, 
  createPeerPaymentTransactions,
  createSignatureInput
} from '../blockchain/transaction';
import { calculateBlockHeaderHash } from '../validation/blockValidator';
import { isHashBelowCeiling, sha256Hash, generateSignature as cryptoGenerateSignature } from '../../utils/cryptoUtils';
import { Node } from '../node';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { getNodePaintColor } from '../../utils/nodeColorUtils';

/**
 * Miner class responsible for creating and mining new blocks
 */

export class Miner {
  public isMining: boolean = false;
  private onBlockMined: (block: Block) => void;
  private node: Node;
  private miningTimer: NodeJS.Timeout | null = null;
  private paintingComplete: boolean = false; // Flag to stop creating paint transactions
  
  constructor(
    onBlockMined: (block: Block) => void,
    node: Node
  ) {
    this.onBlockMined = onBlockMined;
    this.node = node;
  }
  
  /**
   * Mark painting as complete - stops creating paint transactions
   */
  public markPaintingComplete(): void {
    this.paintingComplete = true;
    console.log(`${this.node.getNodeId()}: Painting complete - no more paint transactions will be created`);
  }
  
  /**
   * Check if painting is complete
   */
  public isPaintingComplete(): boolean {
    return this.paintingComplete;
  }
  
  /**
   * Gets the node ID
   */
  private get nodeId(): string {
    return this.node.getNodeId();
  }
  
  /**
   * Gets the peer information map
   */
  get peers(): PeerInfoMap {
    return this.node.getPeerInfos();
  }
  
  /**
   * Gets peers with valid addresses
   * @returns PeerInfoMap containing only peers with valid addresses
   */
  private getValidPeers(): PeerInfoMap {
    const peers = this.peers;
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
   * Gets the mining status
   */
  getIsMining(): boolean {
    return this.isMining;
  }
  
  /**
   * Creates transactions for a new block
   * @param height Block height
   * @returns Promise resolving to array of transactions for the block
   */
  async createBlockTransactions(height: number): Promise<EthereumTransaction[]> {
    
    // Create coinbase transaction (miner receives block reward)
    const coinbaseTransaction = createCoinbaseTransaction(this.node.getAddress());
    
    const transactions: EthereumTransaction[] = [coinbaseTransaction];
    
    // Get peers with valid addresses
    const validPeers = this.getValidPeers();
    
    if (Object.keys(validPeers).length === 0) {
      console.warn('No peers with valid addresses available for peer payments');
      return transactions;
    }
    
    // Get miner's current nonce from world state
    // Coinbase transactions don't increment nonce, so we use the miner's current nonce
    const worldState = this.node.getWorldState();
    const minerAccount = worldState[this.node.getAddress()];
    const baseNonce = minerAccount ? minerAccount.nonce : 0;
    
    // IMPORTANT: Add mempool transactions FIRST
    // This ensures peer payments and paint transactions use nonces that come after mempool transactions
    const maxMempoolSlots = SimulatorConfig.MAX_BLOCK_TRANSACTIONS - 1 - Object.keys(validPeers).length; // Reserve slots for coinbase, peer payments, and paint tx
    const mempoolTransactions = this.node.getMempoolTransactions(Math.max(0, maxMempoolSlots));
    transactions.push(...mempoolTransactions);
    
    // Calculate starting nonce for peer payments (after mempool transactions)
    const peerPaymentStartNonce = baseNonce + mempoolTransactions.length;
    
    // Create peer payment transactions (one per peer)
    const peerPayments = await createPeerPaymentTransactions(
      this.node.getAddress(),
      peerPaymentStartNonce,
      this.node.getPrivateKey(),
      this.node.getPublicKey(),
      validPeers
    );
    
    // Add all peer payment transactions to the block
    transactions.push(...peerPayments);
    
    // After peer payments, create a paint transaction with remaining ETH (truncated to integer)
    const paintNonce = peerPaymentStartNonce + peerPayments.length;
    const paintTransaction = await this.createPaintTransaction(paintNonce);
    if (paintTransaction) {
      transactions.push(paintTransaction);
    }
    
    return transactions;
  }
  
  /**
   * Creates a paint transaction to send remaining ETH (truncated to integer) to EPM contract
   * @param nonce The nonce to use for this transaction
   * @returns Paint transaction or null if insufficient balance
   */
  private async createPaintTransaction(nonce: number): Promise<EthereumTransaction | null> {
    // Don't create paint transactions if painting is complete
    if (this.paintingComplete) {
      return null;
    }
    
    // Get miner's current account state
    const worldState = this.node.getWorldState();
    const minerAccount = worldState[this.node.getAddress()];
    
    if (!minerAccount) return null;
    
    // Calculate how much ETH will be spent on peer payments
    const validPeers = this.getValidPeers();
    const peerCount = Object.keys(validPeers).length;
    const redistributionAmount = SimulatorConfig.BLOCK_REWARD * SimulatorConfig.REDISTRIBUTION_RATIO;
    const totalPeerPayments = peerCount > 0 ? redistributionAmount : 0;
    
    // Calculate remaining balance after peer payments
    const balanceAfterPeerPayments = minerAccount.balance - totalPeerPayments;
    
    // Calculate ETH to send (truncate to integer)
    const ethToSend = Math.floor(balanceAfterPeerPayments);
    
    // Only send if we have at least 1 ETH after peer payments
    if (ethToSend < 1) return null;
    
    const timestamp = Date.now();
    
    // Calculate txid (hash of transaction data)
    // NOTE: Must match validator's calculateTxid - does NOT include data field
    const txString = JSON.stringify({ 
      from: this.node.getAddress(), 
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
      signature = await cryptoGenerateSignature(signatureInput, this.node.getPrivateKey());
    } catch (error) {
      console.error('Error generating signature for paint transaction:', error);
      signature = `error-${timestamp}`;
    }
    
    // Choose a deterministic color for this node based on its ID
    // This ensures each node consistently paints the same color
    const nodeId = this.node.getNodeId();
    const nodeColor = getNodePaintColor(nodeId);
    
    // Build complete paint transaction with color data
    return {
      from: this.node.getAddress(),
      to: '0xEPM_PAINT_CONTRACT',
      value: ethToSend,
      nonce,
      data: JSON.stringify({ color: nodeColor }),
      publicKey: this.node.getPublicKey(),
      signature,
      timestamp,
      txid
    };
  }
  
  /**
   * Starts mining a new block
   * @param previousHeaderHash Hash of the previous block header
   * @param height Height of the new block
   */
  async startMining(previousBlock: Block): Promise<void> {
    const previousHeaderHash = previousBlock.hash!;
    const height = previousBlock.header.height + 1;
    // Don't start if already mining
    if (this.isMining) return;
    
    this.isMining = true;
    
    try {
      // Create transactions for the block - await the async function
      const transactions = await this.createBlockTransactions(height);
      
      // Get all attestations for blocks in the canonical chain from beacon pool
      // Miners include as many attestations as possible to maximize fees
      const beaconState = this.node.getState().beaconState;
      let attestations: any[] = [];
      
      if (beaconState) {
        // Get all blocks in the canonical chain
        const canonicalChain = this.node.getBlocks();
        const canonicalBlockHashes = new Set(canonicalChain.map(b => b.hash).filter((h): h is string => !!h));
        
        // Filter beacon pool to only include attestations for canonical chain blocks
        const allAttestations = beaconState.getBeaconPool();
        attestations = allAttestations.filter((att: any) => canonicalBlockHashes.has(att.blockHash));
      }
      
      // Create the block header
      const header: BlockHeader = {
        transactionHash: sha256Hash(JSON.stringify(transactions)),
        timestamp: Date.now(),
        previousHeaderHash,
        ceiling: parseInt(SimulatorConfig.CEILING, 16), // Convert hex ceiling to number
        nonce: 0,
        height
      };
      
      // Create the block with attestations for all canonical chain blocks
      const block: Block = {
        header,
        transactions,
        attestations
      };
      
      // Start mining the block
      this.mineBlock(block, previousHeaderHash);
    } catch (error) {
      console.error('Error creating transactions for mining:', error);
      this.isMining = false;
    }
  }
  
  /**
   * Stops the current mining operation
   */
  stopMining(): void {
    this.isMining = false;
    if (this.miningTimer) {
      clearTimeout(this.miningTimer);
      this.miningTimer = null;
    }
  }
  
  /**
   * Mines a block by finding a valid nonce
   */
  private mineBlock(block: Block, expectedPreviousHash: string): void {
    // Schedule mining to not block the main thread
    this.miningTimer = setTimeout(() => {
      // Check if we should stop mining
      if (!this.isMining) return;
      
      // Perform a batch of mining attempts
      const batchSize = SimulatorConfig.MINING_BATCH_SIZE;
      let found = false;
      
      for (let i = 0; i < batchSize; i++) {
        // Calculate the block hash
        const blockHash = calculateBlockHeaderHash(block.header);
        
        // Check if the hash is valid
        if (isHashBelowCeiling(blockHash, SimulatorConfig.CEILING)) {
          // Found a valid block!
          block.hash = blockHash;
          this.handleMinedBlock(block);
          found = true;
          break;
        }
        
        // Try a random nonce - this better represents the true nature of Bitcoin mining
        // where miners are essentially playing a lottery with random guesses
        // Bitcoin uses a 32-bit nonce (0 to 0xFFFFFFFF or 2^32 - 1)
        block.header.nonce = Math.floor(Math.random() * 0xFFFFFFFF);
      }
      
      // If we didn't find a valid block, continue mining
      if (!found && this.isMining) {
        // Check if the previous block hash is still the expected one
        // If not, we need to restart mining with the new previous block
        if (block.header.previousHeaderHash !== expectedPreviousHash) {
          console.log('Previous block changed, stopping current mining operation');
          this.stopMining();
          return;
        }
        
        this.mineBlock(block, expectedPreviousHash);
      }
    }, 0);
  }
  
  /**
   * Handles a successfully mined block
   */
  private handleMinedBlock(block: Block): void {
    this.isMining = false;
    
    // Notify listeners that a block was mined
    this.onBlockMined(block);
  }
}

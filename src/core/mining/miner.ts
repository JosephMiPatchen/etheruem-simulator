import { Block, Transaction, PeerInfoMap, BlockHeader } from '../../types/types';
import { SimulatorConfig } from '../../config/config';
import { 
  createCoinbaseTransaction, 
  createRedistributionTransaction 
} from '../blockchain/transaction';
import { calculateBlockHeaderHash } from '../validation/blockValidator';
import { isHashBelowCeiling, sha256Hash } from '../../utils/cryptoUtils';
import { Node } from '../node';

/**
 * Miner class responsible for creating and mining new blocks
 */

export class Miner {
  public isMining: boolean = false;
  private onBlockMined: (block: Block) => void;
  private node: Node;
  private miningTimer: NodeJS.Timeout | null = null;
  
  constructor(
    onBlockMined: (block: Block) => void,
    node: Node
  ) {
    this.onBlockMined = onBlockMined;
    this.node = node;
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
  async createBlockTransactions(height: number): Promise<Transaction[]> {
    
    // Create coinbase transaction
    const coinbaseTransaction = createCoinbaseTransaction(
      this.nodeId, 
      height,
      this.node.getAddress() // for lock on the output
    );
    
    // If we have peers, create a redistribution transaction
    if (coinbaseTransaction.txid) {
      // Get peers with valid addresses
      const validPeers = this.getValidPeers();
      
      if (Object.keys(validPeers).length === 0) {
        console.warn('No peers with valid addresses available for redistribution');
        return [coinbaseTransaction];
      }
      
      // Create redistribution transaction - await the async function
      const redistributionTransaction = await createRedistributionTransaction(
        coinbaseTransaction.txid,
        this.nodeId,
        height,
        this.node.getPrivateKey(),
        this.node.getPublicKey(),
        this.node.getAddress(),
        validPeers
      );
      
      return [coinbaseTransaction, redistributionTransaction];
    }
    
    // Otherwise, just return the coinbase transaction
    return [coinbaseTransaction];
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
      
      // Create the block header
      const header: BlockHeader = {
        transactionHash: sha256Hash(JSON.stringify(transactions)),
        timestamp: Date.now(),
        previousHeaderHash,
        ceiling: parseInt(SimulatorConfig.CEILING, 16), // Convert hex ceiling to number
        nonce: 0,
        height
      };
      
      // Create the block
      const block: Block = {
        header,
        transactions
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

import { SimulatorConfig } from '../../config/config';
import { Block, EthereumTransaction, Account } from '../../types/types';
import { createEPMContract } from '../epm/epmInit';
import { EPM } from '../epm/EPM';
import { ReceiptsDatabase, TransactionReceipt } from '../../types/receipt';

/**
 * WorldState class for Ethereum account model
 * This will eventually become a simplified EVM
 */
export class WorldState {
  public accounts: Record<string, Account>;
  public receipts: ReceiptsDatabase;  // Chaindata: transaction receipts

  constructor(initialAccounts: Record<string, Account> = {}) {
    // Deep copy the accounts to avoid reference issues
    // When validating blocks, we create a temp world state that should not modify the original
    this.accounts = structuredClone(initialAccounts);
    this.receipts = {};  // Initialize empty receipts database
  }

  /**
   * Gets an account by address
   */
  getAccount(address: string): Account | undefined {
    return this.accounts[address];
  }

  /**
   * Creates a transaction receipt and stores it in the receipts database
   */
  private createReceipt(
    transaction: EthereumTransaction,
    blockHash: string,
    blockNumber: number,
    txIndex: number,
    status: 0 | 1,
    gasUsed: number,
    cumulativeGasUsed: number,
    contractAddress: string | null = null,
    revertReason?: string
  ): void {
    const receipt: TransactionReceipt = {
      transactionHash: transaction.txid,
      transactionIndex: txIndex,
      blockHash: blockHash,
      blockNumber: blockNumber,
      from: transaction.from,
      to: transaction.to === '0x0' ? null : transaction.to,
      status: status,
      gasUsed: gasUsed,
      cumulativeGasUsed: cumulativeGasUsed,
      contractAddress: contractAddress,
      logs: [], // Empty for now
      revertReason: revertReason
    };

    // Store receipt in receipts database
    if (!this.receipts[blockHash]) {
      this.receipts[blockHash] = {};
    }
    this.receipts[blockHash][transaction.txid] = receipt;
  }

  /**
   * Helper function to process a transaction for WorldState updates
   * Updates sender and recipient account balances and nonces
   * Also handles EPM contract deployment and creates transaction receipts
   */
  private processTransaction(
    transaction: EthereumTransaction, 
    blockHash?: string, 
    blockNumber?: number, 
    txIndex?: number,
    cumulativeGasUsed?: number
  ): { gasUsed: number; status: 0 | 1; revertReason?: string } {
    const { from, to, value, data } = transaction;
    
    // Check if this is a coinbase transaction (block reward)
    const isCoinbase = from === SimulatorConfig.REWARDER_NODE_ID;
    
    // Check if this is a paint transaction to EPM contract
    // Paint transactions have JSON data with a color field
    let isPaintTransaction = false;
    if (to === '0xEPM_PAINT_CONTRACT' && data) {
      try {
        const parsedData = JSON.parse(data);
        isPaintTransaction = parsedData.color !== undefined;
      } catch (e) {
        // Not valid JSON, not a paint transaction
      }
    }
    
    // Handle paint transactions to EPM contract
    if (isPaintTransaction && this.accounts[to]) {
      console.log(`Processing paint transaction: ${value} ETH from ${from} to ${to}`);
      console.log(`Contract balance before: ${this.accounts[to].balance}`);
      
      // Try to execute the paint transaction
      // Use transaction ID as block hash if not provided
      const txBlockHash = blockHash || transaction.txid;
      const result = EPM.executeTransaction(this.accounts[to], transaction, txBlockHash);
      
      const gasUsed = 21000; // Simplified gas for now
      
      if (result.success) {
        // Transaction succeeded - update the contract account
        this.accounts[to] = result.account;
        console.log(`Paint transaction SUCCESS! Contract balance after: ${this.accounts[to].balance}`);
        
        // Deduct ETH from sender and increment nonce
        if (this.accounts[from]) {
          this.accounts[from] = {
            ...this.accounts[from],
            balance: this.accounts[from].balance - value,
            nonce: this.accounts[from].nonce + 1
          };
        }
        
        // If painting completed, credit winner with reward
        if (result.winnerReward) {
          const { address, amount } = result.winnerReward;
          console.log(`💰 Crediting winner ${address} with ${amount} ETH reward!`);
          
          if (this.accounts[address]) {
            this.accounts[address] = {
              ...this.accounts[address],
              balance: this.accounts[address].balance + amount
            };
          }
        }
        
        // Create success receipt (only if block context available)
        if (blockHash && blockNumber !== undefined && txIndex !== undefined && cumulativeGasUsed !== undefined) {
          this.createReceipt(
            transaction,
            blockHash,
            blockNumber,
            txIndex,
            1, // success
            gasUsed,
            cumulativeGasUsed + gasUsed,
            null
          );
        }
        
        return { gasUsed, status: 1 };
      } else {
        // Transaction rejected by contract (e.g., painting complete)
        // Don't deduct ETH from sender, but still increment nonce
        console.log(`Paint transaction REJECTED: ${result.error}`);
        if (this.accounts[from]) {
          this.accounts[from] = {
            ...this.accounts[from],
            nonce: this.accounts[from].nonce + 1
          };
        }
        
        // Create failure receipt (only if block context available)
        if (blockHash && blockNumber !== undefined && txIndex !== undefined && cumulativeGasUsed !== undefined) {
          this.createReceipt(
            transaction,
            blockHash,
            blockNumber,
            txIndex,
            0, // failure
            gasUsed,
            cumulativeGasUsed + gasUsed,
            null,
            result.error
          );
        }
        
        return { gasUsed, status: 0, revertReason: result.error };
      }
    }
    
    // Check if this is a contract creation (to address is 0x0)
    const isContractCreation = to === '0x0';
    let contractAddress = to;
    
    // If creating a contract, generate the contract address
    if (isContractCreation && data) {
      // For EPM contracts, use a static well-known address
      // This makes it easy to send paint transactions to the contract
      contractAddress = '0xEPM_PAINT_CONTRACT';
      
      // Create the EPM contract account
      const epmAccount = createEPMContract(contractAddress, data);
      
      // Add the contract account to world state
      this.accounts[contractAddress] = epmAccount;
      
      const gasUsed = 53000; // Contract creation gas
      
      // Create success receipt for contract creation (only if block context available)
      if (blockHash && blockNumber !== undefined && txIndex !== undefined && cumulativeGasUsed !== undefined) {
        this.createReceipt(
          transaction,
          blockHash,
          blockNumber,
          txIndex,
          1, // success
          gasUsed,
          cumulativeGasUsed + gasUsed,
          contractAddress // Contract address created
        );
      }
      
      return { gasUsed, status: 1 };
    }
    
    // Create recipient account if it doesn't exist (for regular transactions)
    if (!this.accounts[to]) {
      this.accounts[to] = {
        address: to,
        balance: 0,
        nonce: 0
      };
    }
    
    // For regular transactions (not coinbase):
    // Update sender: deduct balance, increment nonce
    if (!isCoinbase && this.accounts[from]) {
      this.accounts[from] = {
        ...this.accounts[from],
        balance: this.accounts[from].balance - value,
        nonce: this.accounts[from].nonce + 1
      };
    }
    
    // Update recipient: add balance (for both coinbase and regular transactions)
    this.accounts[to] = {
      ...this.accounts[to],
      balance: this.accounts[to].balance + value
    };
    
    const gasUsed = 21000; // Standard transfer gas
    
    // Create success receipt for regular transfer (only if block context available)
    if (blockHash && blockNumber !== undefined && txIndex !== undefined && cumulativeGasUsed !== undefined) {
      this.createReceipt(
        transaction,
        blockHash,
        blockNumber,
        txIndex,
        1, // success
        gasUsed,
        cumulativeGasUsed + gasUsed,
        null
      );
    }
    
    return { gasUsed, status: 1 };
  }

  /**
   * Updates the world state with a new transaction
   * Updates account balances and nonces
   * Optionally creates receipts if block context is provided
   */
  updateWithTransaction(
    transaction: EthereumTransaction,
    blockHash?: string,
    blockNumber?: number,
    txIndex?: number
  ): boolean {
    // Validate that sender account exists (unless it's a coinbase transaction)
    const isCoinbase = transaction.from === SimulatorConfig.REWARDER_NODE_ID;
    
    if (!isCoinbase) {
      // Check if sender account exists
      if (!this.accounts[transaction.from]) {
        console.error(`Transaction ${transaction.txid} has missing sender account: ${transaction.from}`);
        return false;
      }
      
      // Check if sender has sufficient balance
      if (this.accounts[transaction.from].balance < transaction.value) {
        console.error(`Transaction ${transaction.txid} has insufficient balance`);
        console.error(`  Sender: ${transaction.from}`);
        console.error(`  Balance: ${this.accounts[transaction.from].balance}`);
        console.error(`  Required: ${transaction.value}`);
        return false;
      }
    }
    
    // Calculate cumulative gas for this transaction
    // In a real implementation, this would track gas across all txs in the block
    const cumulativeGasUsed = (txIndex || 0) * 21000;
    
    // Process the transaction (update balances and nonces, create receipt if block context provided)
    this.processTransaction(transaction, blockHash, blockNumber, txIndex, cumulativeGasUsed);
    return true;
  }

  /**
   * Rebuilds the world state from blocks
   * This is used when switching to a new chain
   */
  static fromBlocks(blocks: Block[]): WorldState {
    const worldState = new WorldState();
    
    // Process each block's transactions with block context for receipt creation
    for (const block of blocks) {
      const transactions = block.transactions as unknown as EthereumTransaction[];
      for (let i = 0; i < transactions.length; i++) {
        worldState.updateWithTransaction(
          transactions[i],
          block.hash,
          block.header.height,
          i
        );
      }
    }
    
    return worldState;
  }

  /**
   * Rebuilds the world state from transactions
   * This is used when switching to a new chain
   */
  static fromTransactions(transactions: EthereumTransaction[]): WorldState {
    const worldState = new WorldState();
    
    // Process transactions in order - use updateWithTransaction to ensure
    // same validation logic as incremental processing
    for (const transaction of transactions) {
      worldState.updateWithTransaction(transaction);
    }
    
    return worldState;
  }
}

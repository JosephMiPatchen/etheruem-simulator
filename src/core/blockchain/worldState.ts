import { SimulatorConfig } from '../../config/config';
import { Block, EthereumTransaction, Account } from '../../types/types';
import { createEPMContract } from '../epm/epmInit';
import { EPM } from '../epm/EPM';

/**
 * WorldState class for Ethereum account model
 * This will eventually become a simplified EVM
 */
export class WorldState {
  public accounts: Record<string, Account>;

  constructor(initialAccounts: Record<string, Account> = {}) {
    this.accounts = initialAccounts;
  }

  /**
   * Gets an account by address
   */
  getAccount(address: string): Account | undefined {
    return this.accounts[address];
  }

  /**
   * Helper function to process a transaction for WorldState updates
   * Updates sender and recipient account balances and nonces
   * Also handles EPM contract deployment
   */
  private processTransaction(transaction: EthereumTransaction): void {
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
      // Get the block hash from the transaction context
      // In a real implementation, this would come from the block being processed
      // For now, we'll use the transaction ID as a proxy for block hash
      const blockHash = transaction.txid;
      
      console.log(`Processing paint transaction: ${value} ETH from ${from} to ${to}`);
      console.log(`Contract balance before: ${this.accounts[to].balance}`);
      
      // Try to execute the paint transaction
      const result = EPM.executeTransaction(this.accounts[to], transaction, blockHash);
      
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
      }
      
      // Early return - paint transaction processed
      return;
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
      
      // Don't process the rest of the transaction logic for contract creation
      return;
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
  }

  /**
   * Updates the world state with a new transaction
   * Updates account balances and nonces
   */
  updateWithTransaction(transaction: EthereumTransaction): boolean {
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
    
    // Process the transaction (update balances and nonces)
    this.processTransaction(transaction);
    return true;
  }

  /**
   * Rebuilds the world state from blocks
   * This is used when switching to a new chain
   */
  static fromBlocks(blocks: Block[]): WorldState {
    // Extract all transactions from blocks
    // TODO: Need to update Block type to support EthereumTransaction
    const transactions = blocks.flatMap(block => 
      block.transactions as unknown as EthereumTransaction[] // Temporary cast until Block type is updated
    );
    return WorldState.fromTransactions(transactions);
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

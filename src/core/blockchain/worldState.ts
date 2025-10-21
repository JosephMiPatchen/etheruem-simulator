import { SimulatorConfig } from '../../config/config';
import { Block, EthereumTransaction, Account } from '../../types/types';

/**
 * WorldState class for Ethereum account model
 * This will eventually become a simplified EVM
 */
export class WorldState {
  private accounts: Record<string, Account>;

  constructor(initialAccounts: Record<string, Account> = {}) {
    this.accounts = initialAccounts;
  }

  /**
   * Gets all accounts (copy)
   */
  getAccounts(): Record<string, Account> {
    return { ...this.accounts };
  }

  /**
   * Gets an account by address
   */
  getAccount(address: string): Account | undefined {
    return this.accounts[address];
  }

  /**
   * Gets account balance
   */
  getBalance(address: string): number {
    return this.accounts[address]?.balance ?? 0;
  }

  /**
   * Gets account nonce
   */
  getNonce(address: string): number {
    return this.accounts[address]?.nonce ?? 0;
  }

  /**
   * Helper function to process a transaction for WorldState updates
   * Updates sender and recipient account balances and nonces
   */
  private processTransaction(transaction: EthereumTransaction): void {
    const { from, to, value } = transaction;
    
    // Create recipient account if it doesn't exist
    if (!this.accounts[to]) {
      this.accounts[to] = {
        address: to,
        balance: 0,
        nonce: 0
      };
    }
    
    // Update sender: deduct balance, increment nonce
    if (this.accounts[from]) {
      this.accounts[from] = {
        ...this.accounts[from],
        balance: this.accounts[from].balance - value,
        nonce: this.accounts[from].nonce + 1
      };
    }
    
    // Update recipient: add balance
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
    
    // Process transactions in order
    for (const transaction of transactions) {
      worldState.processTransaction(transaction);
    }
    
    return worldState;
  }
}

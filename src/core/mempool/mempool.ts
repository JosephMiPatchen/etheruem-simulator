import { EthereumTransaction } from '../../types/types';

/**
 * Mempool - Memory pool for pending transactions
 * 
 * Stores transactions that have been broadcast but not yet included in a block.
 * Each node maintains its own mempool.
 */
export class Mempool {
  private transactions: Map<string, EthereumTransaction>;

  constructor() {
    this.transactions = new Map();
  }

  /**
   * Add a transaction to the mempool
   * @param transaction Transaction to add
   * @returns true if added, false if already exists
   */
  addTransaction(transaction: EthereumTransaction): boolean {
    if (this.transactions.has(transaction.txid)) {
      return false; // Already in mempool
    }
    
    this.transactions.set(transaction.txid, transaction);
    return true;
  }

  /**
   * Remove a transaction from the mempool
   * @param txid Transaction ID to remove
   * @returns true if removed, false if not found
   */
  removeTransaction(txid: string): boolean {
    return this.transactions.delete(txid);
  }

  /**
   * Remove multiple transactions from the mempool
   * @param txids Array of transaction IDs to remove
   */
  removeTransactions(txids: string[]): void {
    for (const txid of txids) {
      this.transactions.delete(txid);
    }
  }

  /**
   * Get a transaction from the mempool
   * @param txid Transaction ID
   * @returns Transaction or undefined if not found
   */
  getTransaction(txid: string): EthereumTransaction | undefined {
    return this.transactions.get(txid);
  }

  /**
   * Get all transactions in the mempool
   * @returns Array of all transactions
   */
  getAllTransactions(): EthereumTransaction[] {
    return Array.from(this.transactions.values());
  }

  /**
   * Get up to N transactions from the mempool
   * @param maxCount Maximum number of transactions to return
   * @returns Array of transactions (up to maxCount)
   */
  getTransactions(maxCount: number): EthereumTransaction[] {
    const allTransactions = this.getAllTransactions();
    return allTransactions.slice(0, maxCount);
  }

  /**
   * Check if a transaction is in the mempool
   * @param txid Transaction ID
   * @returns true if transaction exists in mempool
   */
  hasTransaction(txid: string): boolean {
    return this.transactions.has(txid);
  }

  /**
   * Get the number of transactions in the mempool
   * @returns Number of pending transactions
   */
  size(): number {
    return this.transactions.size;
  }

  /**
   * Clear all transactions from the mempool
   */
  clear(): void {
    this.transactions.clear();
  }
}

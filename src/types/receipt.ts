/**
 * Transaction Receipt - Ethereum-style
 * 
 * Minimal structure matching Ethereum's receipt format.
 * Stores the result of transaction execution.
 */

export interface TransactionReceipt {
  // Transaction identification
  transactionHash: string;        // Hash of the transaction
  transactionIndex: number;        // Index in the block
  blockHash: string;               // Hash of the block containing this tx
  blockNumber: number;             // Block number
  
  // Transaction parties
  from: string;                    // Sender address
  to: string | null;               // Recipient address (null for contract creation)
  
  // Execution result
  status: 0 | 1;                   // 0 = failure/reverted, 1 = success
  
  // Gas (simplified for now, can expand later for PoS)
  gasUsed: number;                 // Gas consumed by this transaction
  cumulativeGasUsed: number;       // Total gas used in block up to this tx
  
  // Contract creation
  contractAddress: string | null;  // Address of created contract (if any)
  
  // Logs/Events (empty array for now, can add later)
  logs: any[];                     // Event logs emitted (empty for now)
  
  // Revert reason (if failed)
  revertReason?: string;           // Why the transaction failed
}

/**
 * Receipts Database - Part of chaindata
 * 
 * Organized by block hash, then transaction hash.
 * In real Ethereum, this would be a Merkle Patricia Trie.
 */
export interface ReceiptsDatabase {
  [blockHash: string]: {
    [txHash: string]: TransactionReceipt;
  };
}

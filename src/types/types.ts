/**
 * Core type definitions for the Ethereum simulator
 */

// ============================================================================
// Ethereum Account Model Types
// ============================================================================

/**
 * Ethereum-style transaction with single from/to addresses
 */
export interface EthereumTransaction {
  from: string;           // Sender address (sha256 of publicKey)
  to: string;             // Recipient address (sha256 of publicKey or contract address)
  value: number;          // Amount to transfer (decimal ETH)
  nonce: number;          // Sender's transaction count (prevents replay attacks)
  data?: string;          // Contract call data
  publicKey: string;      // Sender's public key (proves from address)
  signature: string;      // Signature of transaction data (proves authorization)
  timestamp: number;      // When transaction was created
  txid: string;           // Transaction hash (required)
}

/**
 * Account in the world state
 * Can be either an Externally Owned Account (EOA) or a Contract Account
 */
export interface Account {
  address: string;        // Account address (sha256 of publicKey or contract address)
  balance: number;        // Account balance (decimal ETH)
  nonce: number;          // Transaction count (for replay protection)
  
  // Smart contract fields (undefined for EOAs)
  code?: string;          // Contract bytecode/code (if this is a contract account)
  storage?: any;          // Contract storage (arbitrary data structure)
  codeHash?: string;      // Hash of the contract code (for verification)
}

// ============================================================================
// Blockchain Types
// ============================================================================

export interface BlockHeader { // note: we dont have a field for headers hash, we compute that runtime upon validation to keep process robust
  transactionHash: string;  // SHA256 hash of all transactions
  timestamp: number;        // Local machine time
  previousHeaderHash: string; // Previous block's header hash
  ceiling: number;          // Target threshold value
  nonce: number;            // Value miners adjust to find valid hash
  height: number;           // Block height in the chain
}

export interface Block {
  header: BlockHeader;
  transactions: EthereumTransaction[];
  hash?: string;      // Calculated hash of the block header
}

export interface NodeState {
  nodeId: string;
  blockchain: Block[];
  blockchainTree?: any;  // BlockchainTree for visualization (any to avoid circular dependency)
  worldState: Record<string, Account>;  // Account-based state instead of UTXO
  receipts?: any;  // Transaction receipts database
  mempool?: EthereumTransaction[];  // Pending transactions in mempool
  isMining: boolean;
  peerIds: string[];
  publicKey: string;
  address: string;
}

export interface NetworkMessage {
  type: 'BLOCK_ANNOUNCEMENT' | 'BLOCK_REQUEST' | 'CHAIN_LENGTH_REQUEST' | 'CHAIN_LENGTH_RESPONSE';
  payload: any;
  sender: string;
  recipient: string | 'broadcast';
}

/**
 * Information about a peer node
 */
export interface PeerInfo {
  address: string;
}

/**
 * Map of node IDs to peer information
 */
export interface PeerInfoMap {
  [nodeId: string]: PeerInfo; // Maps nodeId to peer information
}

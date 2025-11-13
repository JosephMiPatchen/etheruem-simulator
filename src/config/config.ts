/**
 * Configuration system for the Bitcoin simulator
 * Contains parameters that can be easily adjusted
 */

export const SimulatorConfig = {
  // Issuance parameters
  BLOCK_REWARD: 4,           // ETH rewarded to proposers
  
  // Network parameters
  NODE_COUNT: 4,             // Number of nodes in the network
  MIN_NETWORK_DELAY_MS: 5,  // Minimum network delay in milliseconds
  MAX_NETWORK_DELAY_MS: 10, // Maximum network delay in milliseconds
  
  // Transaction parameters
  REDISTRIBUTION_RATIO: 0.5, // Ratio of coins to redistribute (0-1)
  MAX_BLOCK_TRANSACTIONS: 10, // Maximum number of transactions per block
  
  // Proof of Stake (PoS) parameters
  SECONDS_PER_SLOT: 2,      // Duration of each slot in seconds
  SLOTS_PER_EPOCH: 4,        // Number of slots per epoch (Ethereum mainnet: 32)
  MAX_EFFECTIVE_BALANCE: 64, // Maximum effective balance in ETH for validators
  GENESIS_RANDAO_MIX: '0x0000000000000000000000000000000000000000000000000000000000000000', // RANDAO mix for epoch -1 (32 bytes of zeros)
  
  // Constants
  REWARDER_NODE_ID: "COINBASE-REWARD",
  GENESIS_PREV_HASH: "0000000000000000000000000000000000000000000000000000000000000000", // Previous hash for genesis blocks
  
  // UI parameters
  MINING_BATCH_SIZE: 1000,   // Number of hash attempts per batch
  UPDATE_INTERVAL_MS: 500,   // UI update interval in milliseconds
  
  // Debug logging toggles
  DEBUG_SYNC: false,         // Enable/disable sync-related console logs
  DEBUG_BLOCK_CREATOR: true, // Enable/disable BlockCreator debug logs
  DEBUG_CONSENSUS: true,     // Enable/disable Consensus debug logs
};

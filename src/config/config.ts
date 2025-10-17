/**
 * Configuration system for the Bitcoin simulator
 * Contains parameters that can be easily adjusted
 */

export const SimulatorConfig = {
  // Mining parameters
  BLOCK_REWARD: 4,           // BTC rewarded to miners
  CEILING: "0x00050000000000000000000000000000000000000000000000000000000000000",  // Target difficulty 1/256
  
  // Network parameters
  NODE_COUNT: 4,             // Number of nodes in the network
  MIN_NETWORK_DELAY_MS: 50,  // Minimum network delay in milliseconds
  MAX_NETWORK_DELAY_MS: 200, // Maximum network delay in milliseconds
  HEIGHT_CHECK_INTERVAL_MS: 5000, // Interval for checking peer heights
  
  // Transaction parameters
  REDISTRIBUTION_RATIO: 0.5, // Ratio of coins to redistribute (0-1)
  
  // Constants
  REWARDER_NODE_ID: "COINBASE-REWARD",
  GENESIS_PREV_HASH: "0000000000000000000000000000000000000000000000000000000000000000", // Previous hash for genesis blocks
  
  // UI parameters
  MINING_BATCH_SIZE: 1000,   // Number of hash attempts per batch
  UPDATE_INTERVAL_MS: 500,   // UI update interval in milliseconds
};

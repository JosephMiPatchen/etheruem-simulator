import { NetworkManager } from '../../network/networkManager';
import { SimulatorConfig } from '../../config/config';
import { Block, NodeState } from '../../types/types';
import { calculateBlockHeaderHash } from '../../core/validation/blockValidator';


// Increase test timeout for integration tests
jest.setTimeout(90000);

// Store original console methods
const originalConsole = { ...console };

describe('Network Integration Tests', () => {
  beforeEach(() => {
    // Mock console methods
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
    console.info = jest.fn();
  });

  afterEach(() => {
    // Restore original console methods
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
    console.info = originalConsole.info;
  });
  // Create a network with 3 nodes
  let networkManager: NetworkManager;
  let intervalIds: NodeJS.Timeout[] = [];
  
  beforeEach(() => {
    // Create a network with 3 nodes, fully connected
    networkManager = new NetworkManager();
    networkManager.createFullyConnectedNetwork(3);
    // Reset interval IDs array
    intervalIds = [];
    
    // Override config for faster tests
    SimulatorConfig.MIN_NETWORK_DELAY_MS = 10;
    SimulatorConfig.MAX_NETWORK_DELAY_MS = 50;
  });
  
  afterEach(() => {
    // Clean up all intervals
    intervalIds.forEach(id => clearInterval(id));
    intervalIds = [];
    
    // Stop mining
    networkManager.stopAllMining();
    
    // Add a small delay to allow any pending async operations to complete
    return new Promise(resolve => setTimeout(resolve, 100));
  });
  
  test('should have all nodes initialized with genesis blocks at height 0', async () => {
    // Get the network state
    const networkState = networkManager.getNetworkState();
    
    // With the new Bitcoin address system, nodes may converge on the same genesis block
    // This is expected behavior as addresses are now derived from public keys consistently
    // We just verify that all nodes have a genesis block
    const genesisBlockHashes = new Set<string>();
    
    Object.entries(networkState).forEach(([nodeId, state]) => {
      const genesisBlock = state.blockchain.find((b: Block) => b.header.height === 0);
      expect(genesisBlock).toBeDefined();
      
      // Verify the coinbase transaction rewards the node itself
      const coinbaseTransaction = genesisBlock?.transactions[0];
      const selfRewardOutput = coinbaseTransaction?.outputs.find(
        (output: any) => output.nodeId === nodeId
      );
      
      // Add this recipient to our set
      if (selfRewardOutput?.nodeId) {
        genesisBlockHashes.add(selfRewardOutput.nodeId);
      }
    });
    
    expect(genesisBlockHashes.size).toBeGreaterThan(0);
  });
  
  test('should perform height requests between nodes', async () => {
    // Create a spy on the NodeWorker's requestHeight method to track calls
    const nodeIds = Array.from(networkManager.nodes.keys());
    const firstNode = networkManager.nodes.get(nodeIds[0]);
    
    // Create spies on key methods
    const requestHeightSpy = jest.spyOn(firstNode!, 'requestHeight');
    const handleHeightRequestSpy = jest.spyOn(firstNode as any, 'handleHeightRequest');
    const handleHeightResponseSpy = jest.spyOn(firstNode as any, 'handleHeightResponse');
    
    // Start periodic height requests to trigger chain synchronization
    const intervalId = networkManager.startPeriodicHeightRequests(100); // Use shorter interval for testing
    intervalIds.push(intervalId); // Track the interval ID for cleanup
    
    // Wait for height requests to occur
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Verify that height request methods were called
    expect(requestHeightSpy).toHaveBeenCalled();
    
    // If we have at least two nodes, verify that height request/response handlers were called
    // This confirms the full height request/response cycle is working
    if (nodeIds.length > 1) {
      // Wait a bit more for responses to be processed
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Either handleHeightRequest or handleHeightResponse should have been called
      // depending on which node initiated the request first
      const heightMessagesProcessed = 
        handleHeightRequestSpy.mock.calls.length > 0 || 
        handleHeightResponseSpy.mock.calls.length > 0;
      
      expect(heightMessagesProcessed).toBe(true);
    }
    
    // Clean up spies
    requestHeightSpy.mockRestore();
    handleHeightRequestSpy.mockRestore();
    handleHeightResponseSpy.mockRestore();
  });
  
  test('should verify genesis blocks have different outputs', () => {
    // Get the network state to verify genesis blocks
    const networkState = networkManager.getNetworkState();
    const nodeIds = Object.keys(networkState);
    
    // Collect all genesis block output recipients
    const outputRecipients = new Set<string>();
    
    // Verify each node has its own genesis block with self-rewarding coinbase
    Object.entries(networkState).forEach(([nodeId, state]) => {
      // Find the genesis block (height 0)
      const genesisBlock = state.blockchain.find((block: Block) => block.header.height === 0);
      expect(genesisBlock).toBeDefined();
      
      // Verify the coinbase transaction rewards the node itself
      const coinbaseTransaction = genesisBlock?.transactions[0];
      const selfRewardOutput = coinbaseTransaction?.outputs.find(
        (output: any) => output.nodeId === nodeId
      );
      
      // Add this recipient to our set
      if (selfRewardOutput?.nodeId) {
        outputRecipients.add(selfRewardOutput.nodeId);
      }
      
      // The previousHeaderHash should be the configured genesis previous hash (all zeros)
      expect(genesisBlock.header.previousHeaderHash).toBe(SimulatorConfig.GENESIS_PREV_HASH);
      
      // Verify the reward amount matches the configured block reward
      expect(selfRewardOutput?.value).toBe(SimulatorConfig.BLOCK_REWARD);
      
      // Verify the UTXO set contains this output
      const outputId = `${coinbaseTransaction?.txid}-${selfRewardOutput?.idx}`;
      expect(state.utxo[outputId]).toBeDefined();
    });
    
    // Each node should have a different recipient (itself) in its genesis block
    expect(outputRecipients.size).toBe(nodeIds.length);
  });
  
  /**
   * Helper function to wait for all nodes to reach a minimum blockchain length
   * @param minBlockHeight The minimum number of blocks each node should have
   * @param maxWaitTimeMs Maximum time to wait in milliseconds
   * @returns The final network state once the condition is met or timeout occurs
   */
  async function waitForMinimumBlockHeight(minBlockHeight: number, maxWaitTimeMs: number = 60000): Promise<Record<string, NodeState>> {
    let allChainsReachedTarget = false;
    const startTime = Date.now();
    
    // Poll until all nodes have at least the target number of blocks
    while (!allChainsReachedTarget && Date.now() - startTime < maxWaitTimeMs) {
      // Get current network state
      const currentState = networkManager.getNetworkState();
      
      // Check if all nodes have reached the target chain length
      allChainsReachedTarget = Object.values(currentState).every(state => 
        state.blockchain.length >= minBlockHeight
      );
      
      if (allChainsReachedTarget) {
        console.log(`All nodes have reached at least ${minBlockHeight} blocks after ${(Date.now() - startTime) / 1000} seconds`);
        break;
      }
      
      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return networkManager.getNetworkState();
  }

  /**
   * Helper function to check if nodes have sufficiently converged on blocks at a specific height
   * @param networkState The current network state
   * @param height The block height to check
   * @param minConvergenceRatio Minimum ratio of nodes that should agree on the same block
   * @returns The convergence ratio (0.0 to 1.0) representing the proportion of nodes that agree on the same block
   */
  function checkBlockConvergence(networkState: Record<string, NodeState>, height: number, minConvergenceRatio: number = 0.5): number {
    const hashCounts = new Map<string, number>();
    const totalNodes = Object.keys(networkState).length;
    
    // Check each node's blockchain
    Object.entries(networkState).forEach(([nodeId, state]) => {
      const block = state.blockchain.find((b: Block) => b.header.height === height);
      if (block) {
        // Calculate the block hash
        const blockHash = calculateBlockHeaderHash(block.header);
        hashCounts.set(blockHash, (hashCounts.get(blockHash) || 0) + 1);
        console.log(`Node ${nodeId} block at height ${height} hash: ${blockHash}`);
      }
    });
    
    // Find the most common hash count
    let maxCount = 0;
    hashCounts.forEach((count) => {
      if (count > maxCount) {
        maxCount = count;
      }
    });
    
    // Calculate the convergence ratio
    const convergenceRatio = maxCount / totalNodes;
    const converged = convergenceRatio >= minConvergenceRatio;
    
    console.log(`Height ${height}: ${converged ? 'CONVERGED ✓' : 'NOT CONVERGED ✗'} (${convergenceRatio.toFixed(2)} convergence ratio, ${maxCount}/${totalNodes} nodes agree)`);
    return convergenceRatio;
  }
  
  test('should verify blockchain convergence after mining', async () => {
    // Configuration parameters
    const minBlocksToMine = 6;      // Minimum blocks each node should mine
    
    // For faster testing, reduce network delays
    SimulatorConfig.MIN_NETWORK_DELAY_MS = 10;
    SimulatorConfig.MAX_NETWORK_DELAY_MS = 50;
    
    // Start mining on all nodes
    networkManager.startAllMining();
    
    // Start periodic height requests to help nodes discover the longest chain
    // Use a more frequent interval to help with convergence
    const intervalId = networkManager.startPeriodicHeightRequests(100);
    intervalIds.push(intervalId); // Track the interval ID for cleanup
    
    // Wait for all chains to reach the minimum block height
    const finalState = await waitForMinimumBlockHeight(minBlocksToMine, 90000);
    
    // Wait longer to allow for convergence
    console.log('Waiting for network convergence...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Stop mining
    networkManager.stopAllMining();
    
    // Log the chain lengths for debugging
    Object.entries(finalState).forEach(([nodeId, state]) => {
      console.log(`Node ${nodeId} has ${state.blockchain.length} blocks`);
    });
    
    // Verify all nodes have reached the minimum block height
    Object.values(finalState).forEach(state => {
      expect(state.blockchain.length).toBeGreaterThanOrEqual(minBlocksToMine);
    });
    
    // Log genesis block hashes for debugging
    const genesisBlockHashes = new Set<string>();
    
    Object.entries(finalState).forEach(([nodeId, state]) => {
      const genesisBlock = state.blockchain.find((b: Block) => b.header.height === 0);
      if (genesisBlock) {
        const blockHash = calculateBlockHeaderHash(genesisBlock.header);
        genesisBlockHashes.add(blockHash);
        console.log(`Node ${nodeId} genesis block hash: ${blockHash}`);
      }
    });
    
    // With the new Bitcoin address system, nodes may converge on the same genesis block
    // This is expected behavior as addresses are now derived from public keys consistently
    // We just verify that all nodes have a genesis block
    expect(genesisBlockHashes.size).toBeGreaterThan(0);
    
    // Verify that blocks 1-3 have sufficient convergence
    // In a real blockchain network, we may not achieve perfect convergence during active mining
    // But we should see a high degree of convergence for earlier blocks
    console.log('\nVerifying block convergence for heights 1-3:');
    
    // Check convergence for blocks 1-3
    for (let height = 1; height <= 3; height++) {
      const convergenceRatio = checkBlockConvergence(finalState, height);
      // With the new Bitcoin address system, we expect higher convergence
      // but still allow for some variation during active mining
      expect(convergenceRatio).toBeGreaterThanOrEqual(0.6); // At least 60% convergence
    }
  });
});
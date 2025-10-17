import { NetworkManager } from '../../network/networkManager';
import { SimulatorConfig } from '../../config/config';

// Mock console methods
const originalConsole = { ...console };

beforeEach(() => {
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
  console.info = jest.fn();
});

afterEach(() => {
  console.log = originalConsole.log;
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;
});

// Mock all validation functions
jest.mock('../../core/validation/securityValidator', () => ({
  validateTransactionSecurity: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../core/validation/transactionValidator', () => ({
  validateTransaction: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../core/validation/blockValidator', () => ({
  validateBlock: jest.fn().mockResolvedValue(true),
  calculateBlockHeaderHash: jest.fn().mockReturnValue('mock-block-hash'),
  calculateTransactionHash: jest.fn().mockReturnValue('mock-tx-hash')
}));

describe('Network Communication', () => {

  // Use a shorter network delay for faster tests
  SimulatorConfig.MIN_NETWORK_DELAY_MS = 0;
  SimulatorConfig.MAX_NETWORK_DELAY_MS = 10;
  
  // Track timeouts for cleanup
  let timeouts: NodeJS.Timeout[] = [];
  
  let networkManager: NetworkManager;
  
  beforeEach(() => {
    // Create a new network manager for each test
    networkManager = new NetworkManager();
    
    // We'll use our tracked timeout function instead of mocking setTimeout
    // This ensures all timeouts are properly cleaned up
  });
  
  afterEach(() => {
    // Clear all timeouts
    timeouts.forEach(timeout => clearTimeout(timeout));
    timeouts = [];
    
    // Restore all mocks
    jest.restoreAllMocks();
    
    // Add a small delay to allow any pending async operations to complete
    return new Promise(resolve => setTimeout(resolve, 100));
  });
  
  describe('Network Setup', () => {
    it('should create a fully connected network', () => {
      // Create a network with 4 nodes
      const nodeIds = networkManager.createFullyConnectedNetwork(4);
      
      // Should have created 4 nodes
      expect(nodeIds.length).toBe(4);
      
      // Each node should be connected to all other nodes
      for (const nodeId of nodeIds) {
        const node = networkManager.getNode(nodeId);
        expect(node).toBeDefined();
        
        // Each node should have 3 peers (all other nodes)
        const state = node!.getState();
        expect(state.peerIds.length).toBe(3);
        
        // Should not include itself as a peer
        expect(state.peerIds.includes(nodeId)).toBe(false);
      }
    });
  });
  
  describe('Message Passing', () => {
    it('should route messages between nodes', async () => {
      // Create a new network manager for this test to avoid interference
      const testNetworkManager = new NetworkManager();
      
      // Create a network with 2 nodes
      const nodeIds = testNetworkManager.createFullyConnectedNetwork(2);
      const [node1Id, node2Id] = nodeIds;
      
      // Get the node worker for node2 (we only need this one for the spy)
      const node2 = testNetworkManager.getNode(node2Id)!;
      
      // Spy on node2's receiveIncomingMessage method
      const receiveMessageSpy = jest.spyOn(node2, 'receiveIncomingMessage');
      
      // Create a mock block
      const mockBlock = {
        header: {
          height: 1,
          previousHeaderHash: SimulatorConfig.GENESIS_PREV_HASH,
          timestamp: Date.now(),
          transactionHash: 'mock-tx-hash',
          nonce: 0,
          ceiling: parseInt(SimulatorConfig.CEILING, 16)
        },
        transactions: [{
          txid: 'mock-coinbase-tx',
          inputs: [{ sourceOutputId: SimulatorConfig.REWARDER_NODE_ID }],
          outputs: [{ idx: 0, nodeId: node1Id, value: SimulatorConfig.BLOCK_REWARD, lock: 'mock-lock' }],
          timestamp: Date.now()
        }],
        hash: 'mock-block-hash'
      };
      
      // Directly create and send a block announcement message
      const blockAnnouncement = {
        type: 'BLOCK_ANNOUNCEMENT',
        fromNodeId: node1Id,
        block: mockBlock
      };
      
      // Directly call the message handler on the network manager
      (testNetworkManager as any).routeMessageFromNode(blockAnnouncement);
      
      // Directly deliver the message
      (testNetworkManager as any).deliverMessageToRecipients(blockAnnouncement);
      
      // Verify that node2 received the message
      expect(receiveMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'BLOCK_ANNOUNCEMENT',
          fromNodeId: node1Id
        })
      );
    });
  });
  
  describe('Chain Synchronization', () => {
    it('should request chain when a longer chain is discovered', async () => {
      // Create a new network manager for this test to avoid interference
      const testNetworkManager = new NetworkManager();
      
      // Create a network with 2 nodes
      const nodeIds = testNetworkManager.createFullyConnectedNetwork(2);
      const [node1Id, node2Id] = nodeIds;
      
      // Get the node for node1
      const node1 = testNetworkManager.getNode(node1Id)!;
      
      // Spy on node1's requestChain method
      const requestChainSpy = jest.spyOn(node1, 'requestChain');
      
      // Create a height response message
      const heightResponse = {
        type: 'HEIGHT_RESPONSE',
        fromNodeId: node2Id,
        toNodeId: node1Id,
        height: 10 // Node1 starts with height 0
      };
      
      // Directly call the node worker's message handler
      (node1 as any).handleHeightResponse(heightResponse);
      
      // Node1 should have requested the chain from node2
      expect(requestChainSpy).toHaveBeenCalledWith(node2Id);
    });
  });
});

import React, { useState, useEffect, useRef } from 'react';
import { NetworkManager } from '../../network/networkManager';
import { NodeState } from '../../types/types';
import NodePanel from '../components/NodePanel';
import { SimulatorProvider, useSimulatorContext } from '../contexts/SimulatorContext';

/**
 * Inner simulator component that uses the simulator context
 */
const SimulatorContentInner: React.FC = () => {
  // State for node states and mining status
  const [nodeStates, setNodeStates] = useState<Record<string, NodeState>>({});
  const [isMining, setIsMining] = useState<boolean>(false);
  
  // Get context functions
  const { detectForks, setAddressToNodeId } = useSimulatorContext();
  
  // Reference to the network manager instance
  const networkManagerRef = useRef<NetworkManager | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const heightIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Initialize the network on component mount
  useEffect(() => {
    // Create network manager
    const networkManager = new NetworkManager();
    networkManagerRef.current = networkManager;
    
    // Create a fully connected network with 4 nodes
    networkManager.createFullyConnectedNetwork(4);
    
    // Build address-to-nodeId mapping for UI
    const mapping = networkManager.getAddressToNodeIdMapping();
    setAddressToNodeId(mapping);
    
    // Update the UI with initial node states
    updateNodeStates();
    
    // Start periodic height requests to help with convergence
    heightIntervalRef.current = networkManager.startPeriodicHeightRequests(1000);

    // Set up interval to update UI regardless of mining status
    intervalRef.current = setInterval(() => {
      updateNodeStates();
    }, 500);
    
    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (heightIntervalRef.current) {
        clearInterval(heightIntervalRef.current);
      }
      networkManager.stopAllNodes();
    };
  }, []);
  
  // Function to update node states from the network manager
  const updateNodeStates = () => {
    if (networkManagerRef.current) {
      const states = networkManagerRef.current.getNetworkState();
      setNodeStates(states);
      
      // Detect forks in the network
      detectForks(states);
    }
  };
  
  // Function to toggle mining on all nodes
  const toggleMining = () => {
    if (!networkManagerRef.current) return;
    
    if (isMining) {
      networkManagerRef.current.stopAllMining();
      setIsMining(false);
    } else {
      networkManagerRef.current.startAllMining();
      setIsMining(true);
    }
  };
  
  // Handle adding transaction to a node's mempool
  const handleAddTransaction = async (nodeId: string, recipient: string, amount: number) => {
    if (!networkManagerRef.current) return;
    
    const success = await networkManagerRef.current.addTransactionToNodeMempool(nodeId, recipient, amount);
    if (success) {
      console.log(`Added transaction to ${nodeId}'s mempool: ${amount} ETH to ${recipient}`);
      
      // Small delay to ensure state is fully updated
      setTimeout(() => {
        updateNodeStates();
        
        // Debug: Check mempool size after update
        const states = networkManagerRef.current?.getNetworkState();
        if (states && states[nodeId]) {
          console.log(`${nodeId} mempool size after update:`, states[nodeId].mempool?.length || 0);
        }
      }, 100);
    } else {
      console.error(`Failed to add transaction to ${nodeId}'s mempool`);
    }
  };
  
  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Ethereum Simulator</h1>
        <button 
          className={`mining-control ${isMining ? 'mining' : ''}`}
          onClick={toggleMining}
        >
          {isMining ? 'Stop Mining' : 'Start Mining'}
        </button>
      </header>
      
      <main className="nodes-container">
        {Object.entries(nodeStates).map(([nodeId, nodeState]) => (
          <NodePanel 
            key={nodeId} 
            nodeState={nodeState}
            onAddTransaction={handleAddTransaction}
          />
        ))}
      </main>
      
      <footer className="app-footer">
        <p>Simple Ethereum Simulator</p>
      </footer>
    </div>
  );
};

/**
 * Main simulator component that provides the context
 */
const SimulatorContent: React.FC = () => {
  return (
    <SimulatorProvider>
      <SimulatorContentInner />
    </SimulatorProvider>
  );
};

export default SimulatorContent;

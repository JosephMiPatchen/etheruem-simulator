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
  
  // Get fork detection from context
  const { detectForks } = useSimulatorContext();
  
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
  const handleToggleMining = () => {
    if (!networkManagerRef.current) return;
    
    if (isMining) {
      // Stop mining
      networkManagerRef.current.stopAllMining();
      updateNodeStates();
    } else {
      // Start mining
      networkManagerRef.current.startAllMining();
      updateNodeStates();
    }
    
    setIsMining(!isMining);
  };
  
  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Bitcoin Simulator</h1>
        <button 
          className={`mining-control ${isMining ? 'mining' : ''}`}
          onClick={handleToggleMining}
        >
          {isMining ? 'Stop Mining' : 'Start Mining'}
        </button>
      </header>
      
      <main className="nodes-container">
        {Object.entries(nodeStates).map(([nodeId, nodeState]) => (
          <NodePanel 
            key={nodeId} 
            nodeState={nodeState}
          />
        ))}
      </main>
      
      <footer className="app-footer">
        <p>Simple Bitcoin Simulator</p>
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

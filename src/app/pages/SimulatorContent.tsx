import React, { useState, useEffect, useRef } from 'react';
import { NetworkManager } from '../../network/networkManager';
import { NodeState } from '../../types/types';
import NodePanel from '../components/NodePanel';
import { SimulatorProvider, useSimulatorContext } from '../contexts/SimulatorContext';
import { SimulatorConfig } from '../../config/config';
import { FaPlay, FaPause, FaSync } from 'react-icons/fa';

/**
 * Inner simulator component that uses the simulator context
 */
const SimulatorContentInner: React.FC = () => {
  // State for node states
  const [nodeStates, setNodeStates] = useState<Record<string, NodeState>>({});
  
  // State for network running status
  const [isNetworkRunning, setIsNetworkRunning] = useState(true);
  
  // State for sync enabled status
  const [isSyncEnabled, setIsSyncEnabled] = useState(true);
  
  // Get context functions
  const { detectForks, setAddressToNodeId } = useSimulatorContext();
  
  // Reference to the network manager instance
  const networkManagerRef = useRef<NetworkManager | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const ghostHeadIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const slotIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
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

    // Set up interval to update UI
    intervalRef.current = setInterval(() => {
      updateNodeStates();
    }, 500);
    
    // Set up interval to broadcast LMD-GHOST heads every second
    ghostHeadIntervalRef.current = setInterval(() => {
      networkManager.broadcastAllGhostHeads();
    }, 1000);
    
    // Set up interval to process consensus slots (configurable PoS slot time)
    slotIntervalRef.current = setInterval(() => {
      networkManager.processAllSlots();
    }, SimulatorConfig.SECONDS_PER_SLOT * 1000);
    
    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (ghostHeadIntervalRef.current) {
        clearInterval(ghostHeadIntervalRef.current);
      }
      if (slotIntervalRef.current) {
        clearInterval(slotIntervalRef.current);
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
  
  // Toggle network running state
  const toggleNetwork = () => {
    if (!networkManagerRef.current) return;
    
    if (isNetworkRunning) {
      // Stop the network
      if (slotIntervalRef.current) {
        clearInterval(slotIntervalRef.current);
        slotIntervalRef.current = null;
      }
      // Set all nodes to idle
      networkManagerRef.current.setAllConsensusStatus('idle');
      setIsNetworkRunning(false);
      console.log('[Network] Stopped');
    } else {
      // Start the network
      slotIntervalRef.current = setInterval(() => {
        networkManagerRef.current?.processAllSlots();
      }, SimulatorConfig.SECONDS_PER_SLOT * 1000);
      setIsNetworkRunning(true);
      console.log('[Network] Started');
    }
  };
  
  // Toggle sync (LMD-GHOST head broadcasting)
  const toggleSync = () => {
    if (!networkManagerRef.current) return;
    
    if (isSyncEnabled) {
      // Stop syncing
      if (ghostHeadIntervalRef.current) {
        clearInterval(ghostHeadIntervalRef.current);
        ghostHeadIntervalRef.current = null;
      }
      setIsSyncEnabled(false);
      console.log('[Sync] Disabled');
    } else {
      // Start syncing
      ghostHeadIntervalRef.current = setInterval(() => {
        networkManagerRef.current?.broadcastAllGhostHeads();
      }, 1000);
      setIsSyncEnabled(true);
      console.log('[Sync] Enabled');
    }
  };
  
  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Ethereum Simulator</h1>
        <div className="controls-container">
          <button 
            className={`control-button ${isNetworkRunning ? 'active' : 'inactive'}`}
            onClick={toggleNetwork}
            title={isNetworkRunning ? 'Stop block production' : 'Start block production'}
          >
            {isNetworkRunning ? <FaPause /> : <FaPlay />}
            <span>{isNetworkRunning ? 'Network Running' : 'Network Stopped'}</span>
          </button>
          <button 
            className={`control-button ${isSyncEnabled ? 'active' : 'inactive'}`}
            onClick={toggleSync}
            title={isSyncEnabled ? 'Disable sync broadcasting' : 'Enable sync broadcasting'}
          >
            <FaSync className={isSyncEnabled ? 'spinning' : ''} />
            <span>{isSyncEnabled ? 'Sync Enabled' : 'Sync Disabled'}</span>
          </button>
        </div>
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

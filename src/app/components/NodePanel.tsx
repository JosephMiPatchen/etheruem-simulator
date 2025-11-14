import React, { useState, useMemo } from 'react';
import { NodeState } from '../../types/types';
import BlockchainView from './BlockchainView';
import WorldStateView from './WorldStateView';
import BeaconStateView from './BeaconStateView';
import NodeToolbar from './NodeToolbar';
import AddTransactionModal from './AddTransactionModal';
import { NodeSettingsModal } from './NodeSettingsModal';
import { useSimulatorContext } from '../contexts/SimulatorContext';
import { getNodeColorEmoji, getNodeColorCSS } from '../../utils/nodeColorUtils';
import './NodePanel.css';

interface NodePanelProps {
  nodeState: NodeState;
  allNodeIds?: string[];
  onAddTransaction?: (nodeId: string, recipient: string, amount: number) => void;
  onUpdateNetworkDelay?: (nodeId: string, multiplier: number) => void;
}

const NodePanel: React.FC<NodePanelProps> = ({ nodeState, allNodeIds = [], onAddTransaction, onUpdateNetworkDelay }) => {
  const [showUtxoModal, setShowUtxoModal] = useState(false);
  const [showBeaconStateModal, setShowBeaconStateModal] = useState(false);
  const [showAddTxModal, setShowAddTxModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const { addressToNodeId } = useSimulatorContext();
  
  // Find the address for this node
  const nodeAddress = useMemo(() => {
    return Object.entries(addressToNodeId)
      .find(([_, nodeId]) => nodeId === nodeState.nodeId)?.[0];
  }, [addressToNodeId, nodeState.nodeId]);
  
  // Get the account balance - updates only when the actual balance changes
  const totalEth = nodeAddress ? (nodeState.worldState?.[nodeAddress]?.balance || 0) : 0;
  
  // Handler for adding transaction to mempool
  const handleAddTransaction = (recipient: string, amount: number) => {
    if (onAddTransaction) {
      onAddTransaction(nodeState.nodeId, recipient, amount);
    }
  };
  
  // Handler for updating network delay multiplier
  const handleSaveNetworkDelay = (multiplier: number) => {
    if (onUpdateNetworkDelay) {
      onUpdateNetworkDelay(nodeState.nodeId, multiplier);
    }
  };
  
  return (
    <div className="node-panel">
      <div className="node-header">
        <div className="node-info">
          <div className="node-id-container">
            <h2 style={{ color: getNodeColorCSS(nodeState.nodeId) }}>
              {nodeState.nodeId} {getNodeColorEmoji(nodeState.nodeId)}
              {nodeAddress && (
                <span className="node-address-suffix">
                  {nodeAddress.slice(-4)}
                </span>
              )}
              <button 
                className="settings-icon-button" 
                onClick={() => setShowSettingsModal(true)}
                title="Node Settings"
              >
                ⚙️
              </button>
            </h2>
          </div>
          <NodeToolbar 
            isMining={nodeState.isMining}
            consensusStatus={nodeState.consensusStatus}
            totalEth={totalEth}
            onUtxoClick={() => setShowUtxoModal(true)}
            onBeaconStateClick={() => setShowBeaconStateModal(true)}
            onAddTransaction={() => setShowAddTxModal(true)}
            nodeId={nodeState.nodeId}
          />
        </div>
      </div>
      
      <BlockchainView 
        blocks={nodeState.blockchain} 
        worldState={nodeState.worldState}
        receipts={nodeState.receipts}
      />
      
      {/* UTXO Modal */}
      {showUtxoModal && (
        <div className="modal-overlay" onClick={() => setShowUtxoModal(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{nodeState.nodeId} Node</h3>
              <button className="close-button" onClick={() => setShowUtxoModal(false)}>×</button>
            </div>
            <div className="modal-content">
              <WorldStateView 
                worldState={nodeState.worldState || {}} 
                receipts={nodeState.receipts}
                mempool={nodeState.mempool}
                blockchainTree={nodeState.blockchainTree}
                beaconState={nodeState.beaconState}
                allNodeIds={allNodeIds} 
                nodeId={nodeState.nodeId} 
              />
            </div>
          </div>
        </div>
      )}

      {/* Add Transaction Modal */}
      {showAddTxModal && nodeAddress && (
        <AddTransactionModal
          nodeId={nodeState.nodeId}
          nodeAddress={nodeAddress}
          worldState={nodeState.worldState || {}}
          onClose={() => setShowAddTxModal(false)}
          onSubmit={handleAddTransaction}
        />
      )}

      {/* Beacon State Modal */}
      {showBeaconStateModal && nodeState.beaconState && (
        <BeaconStateView
          beaconState={nodeState.beaconState}
          blockchain={nodeState.blockchain}
          onClose={() => setShowBeaconStateModal(false)}
        />
      )}
      
      {/* Node Settings Modal */}
      {showSettingsModal && (
        <NodeSettingsModal
          nodeId={nodeState.nodeId}
          currentMultiplier={nodeState.networkDelayMultiplier || 1.0}
          onClose={() => setShowSettingsModal(false)}
          onSave={handleSaveNetworkDelay}
        />
      )}
    </div>
  );
};

export default NodePanel;

import React, { useState, useMemo } from 'react';
import { NodeState } from '../../types/types';
import BlockchainView from './BlockchainView';
import WorldStateView from './WorldStateView';
import NodeToolbar from './NodeToolbar';
import AddTransactionModal from './AddTransactionModal';
import { useSimulatorContext } from '../contexts/SimulatorContext';
import { getNodeColorEmoji, getNodeColorCSS } from '../../utils/nodeColorUtils';
import './NodePanel.css';

interface NodePanelProps {
  nodeState: NodeState;
  allNodeIds?: string[];
  onAddTransaction?: (nodeId: string, recipient: string, amount: number) => void;
}

const NodePanel: React.FC<NodePanelProps> = ({ nodeState, allNodeIds = [], onAddTransaction }) => {
  const [showUtxoModal, setShowUtxoModal] = useState(false);
  const [showAddTxModal, setShowAddTxModal] = useState(false);
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
  
  return (
    <div className="node-panel">
      <div className="node-header">
        <div className="node-info">
          <div className="node-id-container">
            <h2 style={{ color: getNodeColorCSS(nodeState.nodeId) }}>
              {nodeState.nodeId} {getNodeColorEmoji(nodeState.nodeId)}
            </h2>
          </div>
          <NodeToolbar 
            isMining={nodeState.isMining}
            totalEth={totalEth}
            onUtxoClick={() => setShowUtxoModal(true)}
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
    </div>
  );
};

export default NodePanel;

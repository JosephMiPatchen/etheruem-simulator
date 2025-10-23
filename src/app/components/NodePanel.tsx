import React, { useState, useMemo } from 'react';
import { NodeState } from '../../types/types';
import BlockchainView from './BlockchainView';
import WorldStateView from './WorldStateView';
import NodeToolbar from './NodeToolbar';
import { useSimulatorContext } from '../contexts/SimulatorContext';
import './NodePanel.css';

interface NodePanelProps {
  nodeState: NodeState;
  allNodeIds?: string[];
}

const NodePanel: React.FC<NodePanelProps> = ({ nodeState, allNodeIds = [] }) => {
  const [showUtxoModal, setShowUtxoModal] = useState(false);
  const { addressToNodeId } = useSimulatorContext();
  
  // Find the address for this node
  const nodeAddress = useMemo(() => {
    return Object.entries(addressToNodeId)
      .find(([_, nodeId]) => nodeId === nodeState.nodeId)?.[0];
  }, [addressToNodeId, nodeState.nodeId]);
  
  // Get the account balance - updates only when the actual balance changes
  const totalEth = nodeAddress ? (nodeState.worldState?.[nodeAddress]?.balance || 0) : 0;
  
  return (
    <div className="node-panel">
      <div className="node-header">
        <div className="node-info">
          <div className="node-id-container">
            <h2>{nodeState.nodeId}</h2>
          </div>
          <NodeToolbar 
            isMining={nodeState.isMining}
            totalEth={totalEth}
            onUtxoClick={() => setShowUtxoModal(true)}
            nodeId={nodeState.nodeId}
          />
        </div>
      </div>
      
      <BlockchainView blocks={nodeState.blockchain} worldState={nodeState.worldState} />
      
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
                allNodeIds={allNodeIds} 
                nodeId={nodeState.nodeId} 
              />
            </div>
          </div>
        </div>
      )}


    </div>
  );
};

export default NodePanel;

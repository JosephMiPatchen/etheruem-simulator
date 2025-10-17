import React, { useState, useMemo } from 'react';
import { NodeState } from '../../types/types';
import BlockchainView from './BlockchainView';
import UTXOView from './UTXOView';
import NodeToolbar from './NodeToolbar';
import TransactionModal from './TransactionModal';
import './NodePanel.css';

interface NodePanelProps {
  nodeState: NodeState;
  allNodeIds?: string[];
}

const NodePanel: React.FC<NodePanelProps> = ({ nodeState, allNodeIds = [] }) => {
  const [showUtxoModal, setShowUtxoModal] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  
  // Calculate total BTC owned by the node
  const nodeTotalBtc = useMemo(() => {
    return Object.values(nodeState.utxo)
      .filter(output => output.nodeId === nodeState.nodeId)
      .reduce((total, output) => total + output.value, 0);
  }, [nodeState.utxo, nodeState.nodeId]);
  
  return (
    <div className="node-panel">
      <div className="node-header">
        <div className="node-info">
          <div className="node-id-container">
            <h2>{nodeState.nodeId}</h2>
          </div>
          <NodeToolbar 
            isMining={nodeState.isMining}
            nodeTotalBtc={nodeTotalBtc}
            onUtxoClick={() => setShowUtxoModal(true)}
            onAddTransactionClick={() => setShowTransactionModal(true)}
            nodeId={nodeState.nodeId}
          />
        </div>
      </div>
      
      <BlockchainView blocks={nodeState.blockchain} />
      
      {/* UTXO Modal */}
      {showUtxoModal && (
        <div className="modal-overlay" onClick={() => setShowUtxoModal(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{nodeState.nodeId} Node</h3>
              <button className="close-button" onClick={() => setShowUtxoModal(false)}>×</button>
            </div>
            <div className="modal-content">
              <UTXOView 
                utxoSet={nodeState.utxo} 
                allNodeIds={allNodeIds} 
                nodeId={nodeState.nodeId} 
              />
            </div>
          </div>
        </div>
      )}

      {/* Transaction Modal */}
      <TransactionModal 
        isOpen={showTransactionModal}
        onClose={() => setShowTransactionModal(false)}
        nodeId={nodeState.nodeId}
      />
    </div>
  );
};

export default NodePanel;

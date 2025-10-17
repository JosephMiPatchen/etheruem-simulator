import React from 'react';
import './NodePanel.css';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodeId: string;
}

const TransactionModal: React.FC<TransactionModalProps> = ({ isOpen, onClose, nodeId }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Create Transaction</h3>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        <div className="modal-content">
          {/* Transaction form will go here */}
          <p>Transaction form for node: {nodeId}</p>
        </div>
      </div>
    </div>
  );
};

export default TransactionModal;

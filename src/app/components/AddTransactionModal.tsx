import React, { useState } from 'react';
import './AddTransactionModal.css';

interface AddTransactionModalProps {
  nodeId: string;
  nodeAddress: string;
  onClose: () => void;
  onSubmit: (recipient: string, amount: number) => void;
}

const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  nodeId,
  nodeAddress,
  onClose,
  onSubmit
}) => {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate recipient
    if (!recipient.trim()) {
      setError('Recipient address is required');
      return;
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Amount must be a positive number');
      return;
    }

    // Submit the transaction
    onSubmit(recipient.trim(), amountNum);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container add-tx-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add Transaction to Mempool</h3>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        <div className="modal-content">
          <div className="add-tx-info">
            <p><strong>Node:</strong> {nodeId}</p>
            <p><strong>From:</strong> {nodeAddress}</p>
            <p className="info-text">
              This transaction will be added to {nodeId}'s mempool and included in the next block this node mines.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="add-tx-form">
            <div className="form-group">
              <label htmlFor="recipient">Recipient Address:</label>
              <input
                id="recipient"
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="Enter recipient address (e.g., 0xEPM_PAINT_CONTRACT or another node's address)"
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="amount">Amount (ETH):</label>
              <input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount in ETH"
                className="form-input"
              />
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="form-actions">
              <button type="button" onClick={onClose} className="cancel-button">
                Cancel
              </button>
              <button type="submit" className="submit-button">
                Add to Mempool
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AddTransactionModal;

import React, { useState } from 'react';
import { Account } from '../../types/types';
import './AddTransactionModal.css';

interface AddTransactionModalProps {
  nodeId: string;
  nodeAddress: string;
  worldState: Record<string, Account>;
  onClose: () => void;
  onSubmit: (recipient: string, amount: number) => void;
}

const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  nodeId,
  nodeAddress,
  worldState,
  onClose,
  onSubmit
}) => {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  
  // Get list of accounts for dropdown
  const accounts = Object.keys(worldState).filter(addr => addr !== nodeAddress);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    console.log('AddTransactionModal: Form submitted', { recipient, amount });

    // Validate recipient
    if (!recipient.trim()) {
      setError('Recipient address is required');
      console.log('AddTransactionModal: Validation failed - no recipient');
      return;
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Amount must be a positive number');
      console.log('AddTransactionModal: Validation failed - invalid amount');
      return;
    }

    console.log('AddTransactionModal: Calling onSubmit', { recipient: recipient.trim(), amount: amountNum });
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
            <p><strong>From:</strong> {nodeId} ({nodeAddress.slice(0, 10)}...)</p>
          </div>

          <form onSubmit={handleSubmit} className="add-tx-form">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="recipient">To:</label>
                <select
                  id="recipient"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="form-input"
                  required
                >
                  <option value="">Select recipient...</option>
                  {accounts.map(addr => (
                    <option key={addr} value={addr}>
                      {addr === '0xEPM_PAINT_CONTRACT' 
                        ? '🎨 EPM Paint Contract' 
                        : `${addr.slice(0, 10)}...${addr.slice(-8)}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="amount">Amount (ETH):</label>
                <input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="form-input"
                  required
                />
              </div>
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

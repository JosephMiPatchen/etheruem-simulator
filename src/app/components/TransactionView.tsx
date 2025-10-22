import React from 'react';
import { EthereumTransaction } from '../../types/types';
import { SimulatorConfig } from '../../config/config';
import { useSimulatorContext } from '../contexts/SimulatorContext';
import Xarrow from 'react-xarrows';
import './TransactionView.css';

interface TransactionViewProps {
  transaction: EthereumTransaction;
}

const TransactionView: React.FC<TransactionViewProps> = ({ transaction }) => {
  const { addressToNodeId } = useSimulatorContext();
  
  // Check if this is a coinbase transaction
  const isCoinbase = transaction.from === SimulatorConfig.REWARDER_NODE_ID;
  
  // Get node IDs from addresses
  const fromNodeId = isCoinbase ? SimulatorConfig.REWARDER_NODE_ID : (addressToNodeId[transaction.from] || transaction.from.substring(0, 10));
  const toNodeId = addressToNodeId[transaction.to] || transaction.to.substring(0, 10);
  
  // Generate unique IDs for this transaction
  const txId = `tx-${transaction.txid?.substring(0, 6) || Math.random().toString(36).substring(2, 8)}`;

  return (
    <div className="transaction-item">
      <div className="transaction-header">
        <div className={`tx-type ${isCoinbase ? 'coinbase' : ''}`}>
          {isCoinbase ? 'Coinbase' : 'Transaction'}
        </div>
      </div>
      
      <div className="transaction-flow-container">
        {/* From Section */}
        <div className="tx-inputs-section">
          <div className="section-title">From</div>
          <div className={`tx-input ${isCoinbase ? 'coinbase-input' : ''}`} id={`${txId}-from`}>
            <div className="node-id">{fromNodeId}</div>
            {!isCoinbase && (
              <div className="node-nonce">Nonce: {transaction.nonce}</div>
            )}
          </div>
        </div>
        
        {/* Total Value Section */}
        <div className="tx-total-section" id={`${txId}-total`}>
          <div className="tx-total-value">{transaction.value.toFixed(2)} ETH</div>
        </div>
        
        {/* To Section */}
        <div className="tx-outputs-section">
          <div className="section-title">To</div>
          <div className="tx-output" id={`${txId}-to`}>
            <div className="node-id">{toNodeId}</div>
          </div>
        </div>
        
        {/* Bezier Arrows */}
        <Xarrow
          key={`arrow-in`}
          start={`${txId}-from`}
          end={`${txId}-total`}
          color="var(--primary-color)"
          strokeWidth={2}
          curveness={0.8}
          startAnchor="right"
          endAnchor="left"
          path="smooth"
        />
        
        <Xarrow
          key={`arrow-out`}
          start={`${txId}-total`}
          end={`${txId}-to`}
          color="var(--primary-color)"
          strokeWidth={2}
          curveness={0.8}
          startAnchor="right"
          endAnchor="left"
          path="smooth"
        />
      </div>

      <div className="transaction-details">
        <div className="detail-row">
          <span className="detail-label">Value:</span>
          <span className="detail-value">{transaction.value.toFixed(2)} ETH</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Timestamp:</span>
          <span className="detail-value">{new Date(transaction.timestamp).toLocaleString()}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Type:</span>
          <span className="detail-value">{isCoinbase ? 'Coinbase (Block Reward)' : 'Transfer'}</span>
        </div>
      </div>
    </div>
  );
};

export default TransactionView;

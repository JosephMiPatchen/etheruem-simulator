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
  const fromNodeId = addressToNodeId[transaction.from] || transaction.from.substring(0, 10);
  const toNodeId = addressToNodeId[transaction.to] || transaction.to.substring(0, 10);

  return (
    <div className="transaction-view">
      <div className="transaction-header">
        <h3>Transaction Details</h3>
        <div className="transaction-id">
          <span className="label">TX ID:</span>
          <span className="value">{transaction.txid}</span>
        </div>
      </div>

      <div className="transaction-flow">
        {/* From Node */}
        <div className="transaction-node from-node" id={`from-${transaction.txid}`}>
          <div className="node-label">{isCoinbase ? 'Coinbase' : 'From'}</div>
          <div className="node-id">{fromNodeId}</div>
          <div className="node-address" title={transaction.from}>
            {transaction.from.substring(0, 10)}...{transaction.from.substring(transaction.from.length - 8)}
          </div>
          {!isCoinbase && (
            <div className="node-nonce">Nonce: {transaction.nonce}</div>
          )}
        </div>

        {/* Arrow */}
        <Xarrow
          start={`from-${transaction.txid}`}
          end={`to-${transaction.txid}`}
          color="#4CAF50"
          strokeWidth={2}
          headSize={6}
          labels={{
            middle: (
              <div className="arrow-label">
                <span className="arrow-value">{transaction.value.toFixed(2)} ETH</span>
              </div>
            ),
          }}
        />

        {/* To Node */}
        <div className="transaction-node to-node" id={`to-${transaction.txid}`}>
          <div className="node-label">To</div>
          <div className="node-id">{toNodeId}</div>
          <div className="node-address" title={transaction.to}>
            {transaction.to.substring(0, 10)}...{transaction.to.substring(transaction.to.length - 8)}
          </div>
        </div>
      </div>

      <div className="transaction-details">
        <div className="detail-row">
          <span className="detail-label">Value:</span>
          <span className="detail-value">{transaction.value.toFixed(2)} ETH</span>
        </div>
        {!isCoinbase && (
          <div className="detail-row">
            <span className="detail-label">Nonce:</span>
            <span className="detail-value">{transaction.nonce}</span>
          </div>
        )}
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

import React, { useState } from 'react';
import { EthereumTransaction, Account } from '../../types/types';
import { SimulatorConfig } from '../../config/config';
import { useSimulatorContext } from '../contexts/SimulatorContext';
import Xarrow from 'react-xarrows';
import { MdContentCopy, MdCheck } from 'react-icons/md';
import EPMDisplay from './EPMDisplay';
import './TransactionView.css';

interface TransactionViewProps {
  transaction: EthereumTransaction;
  worldState?: Record<string, Account>; // Optional world state for smart contract display
}

const TransactionView: React.FC<TransactionViewProps> = ({ transaction, worldState }) => {
  const { addressToNodeId } = useSimulatorContext();
  const [copied, setCopied] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Account | null>(null);
  
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
  // Check if this is a coinbase transaction
  const isCoinbase = transaction.from === SimulatorConfig.REWARDER_NODE_ID;
  
  // Check if this is a smart contract transaction
  const isSmartContract = transaction.to === '0xEPM_PAINT_CONTRACT';
  
  // Get the contract account if this is a smart contract transaction
  const contractAccount = isSmartContract && worldState 
    ? worldState[transaction.to]
    : null;
  
  // Get node IDs from addresses for the visualization
  const fromNodeId = isCoinbase ? SimulatorConfig.REWARDER_NODE_ID : (addressToNodeId[transaction.from] || 'Unknown');
  const toNodeId = isSmartContract ? 'Smart Contract' : 
                   transaction.to === '0x0' ? 'PROTOCOL' :
                   (addressToNodeId[transaction.to] || 'Unknown');
  
  // Generate unique IDs for this transaction
  const txId = `tx-${transaction.txid?.substring(0, 6) || Math.random().toString(36).substring(2, 8)}`;
  
  // Format timestamp elegantly
  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffSecs < 60) return `${diffSecs}s ago`;
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="transaction-item">
      <div className="transaction-header">
        <div className={`tx-badge ${isCoinbase ? 'coinbase' : ''}`}>
          {isCoinbase ? 'Coinbase' : 'Transfer'}
        </div>
        <div className="tx-timestamp">{formatTimestamp(transaction.timestamp)}</div>
        <button 
          className="copy-button" 
          onClick={() => copyToClipboard(JSON.stringify(transaction, null, 2))}
          title="Copy transaction data"
        >
          {copied ? <MdCheck /> : <MdContentCopy />}
        </button>
      </div>
      
      <div className="transaction-flow-container">
        {/* From Section */}
        <div className="tx-inputs-section">
          <div className="section-title">From</div>
          <div className={`tx-input ${isCoinbase ? 'coinbase-input' : ''}`} id={`${txId}-from`}>
            <div className="node-id">{fromNodeId}</div>
          </div>
        </div>
        
        {/* Total Value Section */}
        <div className="tx-total-section" id={`${txId}-total`}>
          <div className="tx-total-value">{transaction.value.toFixed(4)}</div>
          <div className="tx-currency">ETH</div>
        </div>
        
        {/* To Section */}
        <div className="tx-outputs-section">
          <div className="section-title">To</div>
          <div className="tx-output" id={`${txId}-to`}>
            {isSmartContract && contractAccount ? (
              <button 
                className="smart-contract-button"
                onClick={() => setSelectedContract(contractAccount)}
                title="View Smart Contract"
              >
                {toNodeId}
              </button>
            ) : (
              <div 
                className="node-id"
                style={toNodeId === 'PROTOCOL' ? { 
                  color: '#ff9800', 
                  fontWeight: 600,
                  borderColor: '#ff9800'
                } : {}}
              >
                {toNodeId}
              </div>
            )}
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

      {/* Transaction Details - Elegant and Subtle */}
      <div className="transaction-metadata">
        <div className="metadata-grid">
          <div className="metadata-item">
            <div className="metadata-label">Transaction ID</div>
            <div className="metadata-value monospace">{transaction.txid}</div>
          </div>
          
          <div className="metadata-item">
            <div className="metadata-label">From Address</div>
            <div className="metadata-value monospace">{transaction.from}</div>
          </div>
          
          <div className="metadata-item">
            <div className="metadata-label">To Address</div>
            <div className="metadata-value monospace">{transaction.to}</div>
          </div>
          
          {!isCoinbase && (
            <div className="metadata-item">
              <div className="metadata-label">Nonce</div>
              <div className="metadata-value">{transaction.nonce}</div>
            </div>
          )}
        </div>
      </div>

      {/* Smart Contract Modal */}
      {selectedContract && (
        <div className="smart-contract-modal-overlay" onClick={() => setSelectedContract(null)}>
          <div className="smart-contract-modal" onClick={(e) => e.stopPropagation()}>
            <div className="smart-contract-modal-header">
              <h2>Smart Contract</h2>
              <button 
                className="smart-contract-modal-close"
                onClick={() => setSelectedContract(null)}
              >
                ×
              </button>
            </div>
            <div className="smart-contract-modal-content">
              <EPMDisplay account={selectedContract} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionView;

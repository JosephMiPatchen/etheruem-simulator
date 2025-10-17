import React from 'react';
import { Transaction, UTXOSet } from '../../types/types';
import { SimulatorConfig } from '../../config/config';
import Xarrow from 'react-xarrows';
import './TransactionView.css';

interface TransactionViewProps {
  transaction: Transaction;
  utxoSet: UTXOSet;
}

interface FormattedTransaction {
  from: Array<{ nodeId: string; value: number }>;
  to: Array<{ nodeId: string; value: number }>;
  value: number;
  isCoinbase: boolean;
}

const TransactionView: React.FC<TransactionViewProps> = ({ transaction, utxoSet }) => {
  // Debug UTXO set and transaction inputs
  console.log('Transaction:', transaction.txid);
  console.log('Inputs:', transaction.inputs);
  console.log('UTXO keys:', Object.keys(utxoSet));
  
  // Check if any of the transaction inputs exist in the UTXO set
  if (transaction.inputs.length > 0) {
    const sourceOutputId = transaction.inputs[0].sourceOutputId;
    console.log('First input sourceOutputId:', sourceOutputId);
    console.log('UTXO entry exists:', utxoSet[sourceOutputId] !== undefined);
  }
  

  // Format transaction for display
  const formatTransaction = (tx: Transaction): FormattedTransaction => {
    if (tx.inputs.length === 0) {
      // Coinbase transaction
      return {
        from: [{ 
          nodeId: SimulatorConfig.REWARDER_NODE_ID, 
          value: tx.outputs.reduce((sum, output) => sum + output.value, 0)
        }],
        to: tx.outputs.map(output => ({
          nodeId: output.nodeId,
          value: output.value
        })),
        value: tx.outputs.reduce((sum, output) => sum + output.value, 0),
        isCoinbase: true
      };
    } else {
      // For regular transactions, look up the node IDs from the UTXO set
      // Each input references a previous output by its sourceOutputId
      
      // Use the sourceNodeId field if available, otherwise try to extract from UTXO set
      const inputs = tx.inputs.map(input => {
        // If sourceNodeId is provided, use it directly (new approach)
        if (input.sourceNodeId) {
          return {
            nodeId: input.sourceNodeId,
            value: tx.outputs.reduce((sum, output) => sum + output.value, 0) / tx.inputs.length
          };
        }
        
        // Legacy fallback: Try to get from UTXO set
        const sourceOutputId = input.sourceOutputId;
        const utxo = utxoSet[sourceOutputId];
        
        if (utxo) {
          return {
            nodeId: utxo.nodeId,
            value: utxo.value
          };
        } else {
          // Final fallback: Extract from sourceOutputId
          const nodeId = sourceOutputId.split('-')[0];
          return {
            nodeId,
            value: tx.outputs.reduce((sum, output) => sum + output.value, 0) / tx.inputs.length
          };
        }
      });
      
      // Group inputs by node ID and sum their values
      const groupedInputs: { [nodeId: string]: number } = {};
      inputs.forEach(input => {
        if (!groupedInputs[input.nodeId]) {
          groupedInputs[input.nodeId] = 0;
        }
        groupedInputs[input.nodeId] += input.value;
      });
      
      // Convert grouped inputs to array format
      const formattedInputs = Object.entries(groupedInputs).map(([nodeId, value]) => ({
        nodeId,
        value
      }));
      
      return {
        from: formattedInputs,
        to: tx.outputs.map(output => ({
          nodeId: output.nodeId,
          value: output.value
        })),
        value: tx.outputs.reduce((sum, output) => sum + output.value, 0),
        isCoinbase: false
      };
    }
  };

  const formattedTx = formatTransaction(transaction);
  const txId = `tx-${transaction.txid?.substring(0, 6) || Math.random().toString(36).substring(2, 8)}`;
  
  return (
    <div className="transaction-item">
      <div className="transaction-header">
        <div className={`tx-type ${formattedTx.isCoinbase ? 'coinbase' : ''}`}>
          {formattedTx.isCoinbase ? 'Coinbase' : 'Transaction'}
        </div>
      </div>
      
      <div className="transaction-flow-container">
        {/* Inputs Section */}
        <div className="tx-inputs-section">
          <div className="section-title">Inputs</div>
          {Array.isArray(formattedTx.from) && formattedTx.from.map((input, idx) => {
            const inputId = `${txId}-input-${idx}`;
            return (
              <div key={idx} className={`tx-input ${formattedTx.isCoinbase ? 'coinbase-input' : ''}`} id={inputId}>
                <div className="node-id">{input.nodeId}</div>
                <div className="node-value">{input.value.toFixed(2)} BTC</div>
              </div>
            );
          })}
        </div>
        
        {/* Total Value Section */}
        <div className="tx-total-section">
          <div className="tx-total-value" id={`${txId}-total`}>{formattedTx.value.toFixed(2)} BTC</div>
        </div>
        
        {/* Outputs Section */}
        <div className="tx-outputs-section">
          <div className="section-title">Outputs</div>
          {Array.isArray(formattedTx.to) && formattedTx.to.map((output, idx) => {
            const outputId = `${txId}-output-${idx}`;
            return (
              <div key={idx} className="tx-output" id={outputId}>
                <div className="node-id">{output.nodeId}</div>
                <div className="node-value">{output.value.toFixed(2)} BTC</div>
              </div>
            );
          })}
        </div>
        
        {/* Bezier Arrows */}
        {Array.isArray(formattedTx.from) && formattedTx.from.map((_, idx) => (
          <Xarrow
            key={`arrow-in-${idx}`}
            start={`${txId}-input-${idx}`}
            end={`${txId}-total`}
            color="var(--primary-color)"
            strokeWidth={2}
            curveness={0.8}
            startAnchor="right"
            endAnchor="left"
            path="smooth"
          />
        ))}
        
        {Array.isArray(formattedTx.to) && formattedTx.to.map((_, idx) => (
          <Xarrow
            key={`arrow-out-${idx}`}
            start={`${txId}-total`}
            end={`${txId}-output-${idx}`}
            color="var(--primary-color)"
            strokeWidth={2}
            curveness={0.8}
            startAnchor="right"
            endAnchor="left"
            path="smooth"
          />
        ))}
      </div>
    </div>
  );
};

export default TransactionView;

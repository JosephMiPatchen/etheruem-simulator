import React, { useState } from 'react';
import { LuPickaxe } from "react-icons/lu";
import { TiDocumentText } from "react-icons/ti";
import { RxDividerVertical } from "react-icons/rx";
import { IoAddCircleSharp } from "react-icons/io5";
import './NodeToolbar.css';

// Question mark icon
const QuestionIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
    <line x1="12" y1="17" x2="12.01" y2="17"></line>
  </svg>
);

interface NodeToolbarProps {
  isMining: boolean;
  nodeTotalBtc: number;
  onUtxoClick: () => void;
  onAddTransactionClick: () => void;
  nodeId: string;
}

const NodeToolbar: React.FC<NodeToolbarProps> = ({ 
  isMining, 
  nodeTotalBtc, 
  onUtxoClick,
  onAddTransactionClick,
  nodeId
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  return (
    <>
      <div className="node-toolbar">
        <div className={`toolbar-item node-status ${isMining ? 'mining' : 'idle'}`}>
          <LuPickaxe size={16} />
          <span>{isMining ? 'Mining' : 'Idle'}</span>
        </div>
        
        <div className="divider"><RxDividerVertical size={20} color="var(--border-color)" /></div>
        
        <div className="toolbar-item node-balance">
          <div className="balance-container">
            <span className="balance-label">Balance</span>
            <div className="balance-value-container">
              <span className="balance-value">{nodeTotalBtc.toFixed(2)} BTC</span>
              <div 
                className="tooltip-icon" 
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setTooltipPosition({ 
                    x: rect.left + window.scrollX, 
                    y: rect.bottom + window.scrollY 
                  });
                  setShowTooltip(true);
                }}
                onMouseLeave={() => setShowTooltip(false)}
              >
                <QuestionIcon />
              </div>
            </div>
          </div>
        </div>
        
        <div className="divider"><RxDividerVertical size={20} color="var(--border-color)" /></div>
        
        <div className="toolbar-item utxo-container">
          <button 
            className="toolbar-button utxo-button" 
            onClick={onUtxoClick}
            title="View UTXO Set"
          >
            <TiDocumentText size={18} />
            <span>UTXO</span>
          </button>
        </div>
        
        <div className="divider"><RxDividerVertical size={20} color="var(--border-color)" /></div>
        
        <div className="toolbar-item transaction-button-container">
          <button 
            className="toolbar-button transaction-button" 
            onClick={onAddTransactionClick}
            title="Create New Transaction"
          >
            <IoAddCircleSharp size={18} />
            <span>Tx</span>
          </button>
        </div>
      </div>

      {/* Standalone Tooltip */}
      {showTooltip && (
        <div 
          className="standalone-tooltip" 
          style={{
            position: 'fixed',
            top: tooltipPosition.y + 10,
            left: tooltipPosition.x - 100,
            zIndex: 9999
          }}
        >
          This balance represents the total Bitcoin owned by node {nodeId}, calculated as the sum of all unspent transaction outputs (UTXOs) belonging to this node's address.
        </div>
      )}
    </>
  );
};

export default NodeToolbar;

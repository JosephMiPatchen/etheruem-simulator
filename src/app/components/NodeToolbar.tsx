import React, { useState } from 'react';
import { LuPickaxe } from "react-icons/lu";
import { RxDividerVertical } from "react-icons/rx";
import { FaEarthAmericas } from "react-icons/fa6";
import { IoMdAdd } from "react-icons/io";
import { GiLighthouse } from "react-icons/gi";
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
  consensusStatus?: 'idle' | 'validating' | 'proposing';
  totalEth: number;
  onUtxoClick: () => void;
  onBeaconStateClick: () => void;
  onAddTransaction: () => void;
  onSettingsClick: () => void;
  onBlockTreeClick: () => void;
  nodeId: string;
}

const NodeToolbar: React.FC<NodeToolbarProps> = ({ 
  isMining,
  consensusStatus = 'idle',
  totalEth, 
  onUtxoClick,
  onBeaconStateClick,
  onAddTransaction,
  onSettingsClick,
  onBlockTreeClick,
  nodeId
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  
  // Get status display text and class
  const getStatusDisplay = () => {
    if (consensusStatus === 'proposing') return { text: 'Proposing', class: 'proposing' };
    if (consensusStatus === 'validating') return { text: 'Validating', class: 'validating' };
    return { text: 'Idle', class: 'idle' };
  };
  
  const status = getStatusDisplay();

  return (
    <>
      <div className="node-toolbar">
        <div className={`toolbar-item node-status ${status.class}`}>
          <LuPickaxe size={16} />
          <span>{status.text}</span>
        </div>
        
        <div className="divider"><RxDividerVertical size={20} color="var(--border-color)" /></div>
        
        <div className="toolbar-item node-balance">
          <div className="balance-container">
            <span className="balance-label">Balance</span>
            <div className="balance-value-container">
              <span className="balance-value">{totalEth.toFixed(2)} ETH</span>
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
        
        <div className="toolbar-item toolbar-actions">
          <button 
            className="toolbar-button world-state-button"
            onClick={onUtxoClick}
            title="View World State"
          >
            <FaEarthAmericas size={14} />
            <span>World State</span>
          </button>
          <button 
            className="toolbar-button beacon-state-button"
            onClick={onBeaconStateClick}
            title="View Beacon State (Consensus Layer)"
          >
            <GiLighthouse size={14} />
            <span>Beacon State</span>
          </button>
          <button 
            className="toolbar-button add-tx-button"
            onClick={onAddTransaction}
            title="Add Transaction to Mempool"
          >
            <IoMdAdd size={16} />
          </button>
          <button 
            className="toolbar-button settings-button"
            onClick={onSettingsClick}
            title="Node Settings"
          >
            <span>Settings</span>
          </button>
          <button 
            className="toolbar-button block-tree-button"
            onClick={onBlockTreeClick}
            title="View Block Tree"
          >
            <span>Block Tree</span>
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
          This balance represents the total Ethereum owned by node {nodeId}, stored in the account's balance in the World State.
        </div>
      )}
    </>
  );
};

export default NodeToolbar;

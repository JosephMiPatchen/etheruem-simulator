import React, { useState } from 'react';
import './NodeSettingsModal.css';

interface NodeSettingsModalProps {
  nodeId: string;
  currentMultiplier: number;
  onClose: () => void;
  onSave: (multiplier: number) => void;
}

/**
 * Modal for configuring per-node settings like network delay multiplier
 */
export const NodeSettingsModal: React.FC<NodeSettingsModalProps> = ({
  nodeId,
  currentMultiplier,
  onClose,
  onSave,
}) => {
  const [multiplier, setMultiplier] = useState(currentMultiplier);

  const handleSave = () => {
    onSave(multiplier);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Node Settings: {nodeId}</h3>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          <div className="setting-group">
            <label htmlFor="delay-multiplier">
              Network Delay Multiplier: {multiplier.toFixed(1)}x
            </label>
            <p className="setting-description">
              Controls how slow this node's network is. Higher values increase the chance of forks.
            </p>
            <input
              id="delay-multiplier"
              type="range"
              min="0.1"
              max="10"
              step="0.1"
              value={multiplier}
              onChange={(e) => setMultiplier(parseFloat(e.target.value))}
              className="slider"
            />
            <div className="slider-labels">
              <span>0.1x (Fast)</span>
              <span>1.0x (Normal)</span>
              <span>10x (Very Slow)</span>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button className="button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

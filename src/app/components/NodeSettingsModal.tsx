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
    <div className="node-settings-modal-overlay" onClick={onClose}>
      <div className="node-settings-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="node-settings-modal-header">
          <h3>Node Settings: {nodeId}</h3>
          <button className="node-settings-modal-close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="node-settings-modal-body">
          <div className="node-settings-modal-setting-group">
            <label htmlFor="delay-multiplier">
              Network Delay Multiplier: {multiplier.toFixed(1)}x
            </label>
            <p className="node-settings-modal-setting-description">
              Controls how slow this node's network is. Higher values increase the chance of forks.
            </p>
            <input
              id="delay-multiplier"
              type="range"
              min="1"
              max="10000"
              step="1"
              value={multiplier}
              onChange={(e) => setMultiplier(parseFloat(e.target.value))}
              className="node-settings-modal-slider"
            />
            <div className="node-settings-modal-slider-labels">
              <span>1x (Normal)</span>
              <span>100x (Slow)</span>
              <span>10,000x (Network Partition)</span>
            </div>
          </div>
        </div>
        
        <div className="node-settings-modal-footer">
          <button className="node-settings-modal-button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="node-settings-modal-button-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

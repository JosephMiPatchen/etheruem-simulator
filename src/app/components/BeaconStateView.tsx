import React from 'react';
import { BeaconState } from '../../core/consensus/beaconState';
import { useSimulatorContext } from '../contexts/SimulatorContext';
import { getNodeColorCSS, getNodeColorEmoji } from '../../utils/nodeColorUtils';
import './BeaconStateView.css';

interface BeaconStateViewProps {
  beaconState: BeaconState;
  onClose: () => void;
}

/**
 * BeaconStateView - Displays the Consensus Layer (CL) beacon state
 */
const BeaconStateView: React.FC<BeaconStateViewProps> = ({ beaconState, onClose }) => {
  const { addressToNodeId } = useSimulatorContext();
  const currentSlot = beaconState.getCurrentSlot();
  const currentEpoch = beaconState.getCurrentEpoch();
  const validators = beaconState.validators;
  const randaoMixes = Array.from(beaconState.randaoMixes.entries());
  const epochSchedule = Array.from(beaconState.currentEpochSchedule.entries());

  return (
    <div className="beacon-state-modal-overlay" onClick={onClose}>
      <div className="beacon-state-modal" onClick={(e) => e.stopPropagation()}>
        <div className="beacon-modal-header">
          <h2>Beacon State (Consensus Layer)</h2>
          <button className="beacon-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="beacon-modal-content">
          {/* Time & Epoch Info */}
          <div className="beacon-section">
            <h3>Time & Epoch Information</h3>
            <div className="beacon-info-grid">
              <div className="beacon-info-item">
                <span className="beacon-label">Genesis Time:</span>
                <span className="beacon-value">{new Date(beaconState.genesisTime * 1000).toLocaleString()}</span>
              </div>
              <div className="beacon-info-item">
                <span className="beacon-label">Current Slot:</span>
                <span className="beacon-value">{currentSlot}</span>
              </div>
              <div className="beacon-info-item">
                <span className="beacon-label">Current Epoch:</span>
                <span className="beacon-value">{currentEpoch}</span>
              </div>
              <div className="beacon-info-item">
                <span className="beacon-label">Slot Duration:</span>
                <span className="beacon-value">12 seconds</span>
              </div>
              <div className="beacon-info-item">
                <span className="beacon-label">Slots per Epoch:</span>
                <span className="beacon-value">32</span>
              </div>
            </div>
          </div>

          {/* Validators */}
          <div className="beacon-section">
            <h3>Validators ({validators.length})</h3>
            <div className="validators-list">
              {validators.length === 0 ? (
                <p className="empty-message">No validators registered</p>
              ) : (
                <div className="validators-grid">
                  {validators.map((validator, idx) => {
                    const nodeId = addressToNodeId[validator.nodeAddress] || 'Unknown';
                    const addressSuffix = validator.nodeAddress.slice(-6);
                    const nodeColor = getNodeColorCSS(nodeId);
                    const nodeEmoji = getNodeColorEmoji(nodeId);
                    return (
                      <div 
                        key={idx} 
                        className="validator-item"
                        style={{ borderLeftColor: nodeColor, borderLeftWidth: '4px' }}
                      >
                        <div className="validator-header">
                          <span className="validator-index">#{idx}</span>
                          <span className="validator-stake">{validator.stakedEth} ETH</span>
                        </div>
                        <div className="validator-node-info">
                          <span className="validator-node-id" style={{ color: nodeColor }}>
                            {nodeId} {nodeEmoji}
                          </span>
                          <span className="validator-address-suffix">({addressSuffix})</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RANDAO Mixes */}
          <div className="beacon-section">
            <h3>RANDAO Mixes</h3>
            <div className="randao-list">
              {randaoMixes.length === 0 ? (
                <p className="empty-message">No RANDAO mixes yet</p>
              ) : (
                randaoMixes.map(([epoch, mix]) => (
                  <div key={epoch} className="randao-item">
                    <span className="randao-epoch">Epoch {epoch}:</span>
                    <span className="randao-mix">{mix}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Current Epoch Schedule */}
          <div className="beacon-section">
            <h3>Current Epoch Schedule</h3>
            <div className="schedule-list">
              {epochSchedule.length === 0 ? (
                <p className="empty-message">No schedule set for current epoch</p>
              ) : (
                <div className="schedule-grid">
                  {epochSchedule.map(([slot, nodeId]) => (
                    <div key={slot} className="schedule-item">
                      <span className="schedule-slot">Slot {slot}:</span>
                      <span className="schedule-validator">{nodeId}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="beacon-modal-footer">
          <button className="beacon-button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default BeaconStateView;

import React, { useState } from 'react';
import { BeaconState } from '../../core/consensus/beaconState';
import { Block } from '../../types/types';
import { useSimulatorContext } from '../contexts/SimulatorContext';
import { getNodeColorCSS, getNodeColorEmoji } from '../../utils/nodeColorUtils';
import AttestationCircle from './AttestationCircle';
import './BeaconStateView.css';

interface BeaconStateViewProps {
  beaconState: BeaconState;
  blockchain: Block[];
  onClose: () => void;
}

/**
 * BeaconStateView - Displays the Consensus Layer (CL) beacon state
 */
const BeaconStateView: React.FC<BeaconStateViewProps> = ({ beaconState, blockchain, onClose }) => {
  const { addressToNodeId } = useSimulatorContext();
  const [selectedAttestation, setSelectedAttestation] = useState<any | null>(null);
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

          {/* Latest Attestations (LMD GHOST Fork Choice) */}
          <div className="beacon-section">
            <h3>Latest Attestations (Fork Choice)</h3>
            <div className="beacon-pool-info">
              <span className="beacon-label">Total Validators:</span>
              <span className="beacon-value">{beaconState.latestAttestations.size}</span>
            </div>
            <div className="beacon-pool-list">
              {beaconState.latestAttestations.size === 0 ? (
                <p className="empty-message">No latest attestations</p>
              ) : (
                <div className="attestations-grid-compact">
                  {Array.from(beaconState.latestAttestations.values()).map((attestation, index) => {
                    // Find the block being attested to get its height
                    const attestedBlock = blockchain.find((b: Block) => b.hash === attestation.blockHash);
                    const blockHeight = attestedBlock ? attestedBlock.header.height : '?';
                    
                    // Get node name (color) from address using context
                    const nodeName = addressToNodeId[attestation.validatorAddress] || 'Unknown';
                    
                    // Check if canonical for modal data
                    const isCanonical = blockchain.some((b: Block) => b.hash === attestation.blockHash);

                    return (
                      <AttestationCircle
                        key={`latest-${attestation.validatorAddress}-${attestation.timestamp}-${index}`}
                        attestation={attestation}
                        blocks={blockchain}
                        addressToNodeId={addressToNodeId}
                        onClick={() => setSelectedAttestation({ ...attestation, blockHeight, nodeName, isCanonical })}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Beacon Pool (Attestations) */}
          <div className="beacon-section">
            <h3>Beacon Pool (Attestations)</h3>
            <div className="beacon-pool-info">
              <span className="beacon-label">Total Attestations:</span>
              <span className="beacon-value">{beaconState.beaconPool.length}</span>
            </div>
            <div className="beacon-pool-list">
              {beaconState.beaconPool.length === 0 ? (
                <p className="empty-message">No attestations in beacon pool</p>
              ) : (
                <div className="attestations-grid-compact">
                  {beaconState.beaconPool.slice().reverse().map((attestation, index) => {
                    // Find the block being attested to get its height
                    const attestedBlock = blockchain.find((b: Block) => b.hash === attestation.blockHash);
                    const blockHeight = attestedBlock ? attestedBlock.header.height : '?';
                    
                    // Get node name (color) from address using context
                    const nodeName = addressToNodeId[attestation.validatorAddress] || 'Unknown';
                    
                    // Check if canonical for modal data
                    const isCanonical = blockchain.some((b: Block) => b.hash === attestation.blockHash);

                    return (
                      <AttestationCircle
                        key={`${attestation.validatorAddress}-${attestation.timestamp}-${index}`}
                        attestation={attestation}
                        blocks={blockchain}
                        addressToNodeId={addressToNodeId}
                        onClick={() => setSelectedAttestation({ ...attestation, blockHeight, nodeName, isCanonical })}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="beacon-modal-footer">
          <button className="beacon-button" onClick={onClose}>Close</button>
        </div>
      </div>
      
      {/* Attestation Detail Modal */}
      {selectedAttestation && (
        <div className="block-modal-overlay" onClick={() => setSelectedAttestation(null)}>
          <div className="block-modal attestation-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Attestation Details</h3>
              <button className="close-button" onClick={() => setSelectedAttestation(null)}>×</button>
            </div>
            
            <div className="block-modal-content">
              <div className="attestation-detail-section">
                <div className="info-row">
                  <span className="info-label">Validator Node:</span>
                  <span className="info-value" style={{ color: getNodeColorCSS(selectedAttestation.nodeName), fontWeight: 'bold' }}>
                    {selectedAttestation.nodeName}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Validator Address:</span>
                  <span className="info-value hash-value">{selectedAttestation.validatorAddress}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Block Hash:</span>
                  <span className="info-value hash-value">{selectedAttestation.blockHash}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Block Height:</span>
                  <span className="info-value">{selectedAttestation.blockHeight}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Timestamp:</span>
                  <span className="info-value">{new Date(selectedAttestation.timestamp).toLocaleString()}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Canonical Chain:</span>
                  <span className="info-value">
                    {selectedAttestation.isCanonical ? 
                      <span className="valid-hash">Yes ✓</span> : 
                      <span className="invalid-hash">No (Forked)</span>
                    }
                  </span>
                </div>
              </div>
              
              <div className="attestation-raw-data">
                <h4>Raw Data</h4>
                <pre className="raw-data-display">
                  {JSON.stringify({
                    validatorAddress: selectedAttestation.validatorAddress,
                    blockHash: selectedAttestation.blockHash,
                    timestamp: selectedAttestation.timestamp
                  }, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BeaconStateView;

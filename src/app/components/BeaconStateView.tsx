import React, { useState } from 'react';
import { BeaconState } from '../../core/consensus/beaconState';
import { Block } from '../../types/types';
import { useSimulatorContext } from '../contexts/SimulatorContext';
import { getNodeColorCSS, getNodeColorEmoji } from '../../utils/nodeColorUtils';
import AttestationCircle from './AttestationCircle';
import ProposerScheduleTimeline from './ProposerScheduleTimeline';
import { SimulatorConfig } from '../../config/config';
import './BeaconStateView.css';

interface BeaconStateViewProps {
  beaconState: BeaconState;
  blockchain: Block[];
  blockchainTree?: any; // Blockchain tree for looking up blocks on forks
  onClose: () => void;
}

/**
 * BeaconStateView - Displays the Consensus Layer (CL) beacon state
 */
const BeaconStateView: React.FC<BeaconStateViewProps> = ({ beaconState, blockchain, blockchainTree, onClose }) => {
  const { addressToNodeId } = useSimulatorContext();
  const [selectedAttestation, setSelectedAttestation] = useState<any | null>(null);
  const currentSlot = beaconState.getCurrentSlot();
  const currentEpoch = beaconState.getCurrentEpoch();
  const validators = beaconState.validators;
  const randaoMixes = Array.from(beaconState.randaoMixes.entries());

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
                <span className="beacon-value">{SimulatorConfig.SECONDS_PER_SLOT} seconds</span>
              </div>
              <div className="beacon-info-item">
                <span className="beacon-label">Slots per Epoch:</span>
                <span className="beacon-value">{SimulatorConfig.SLOTS_PER_EPOCH}</span>
              </div>
            </div>
          </div>

          {/* Casper FFG Checkpoints */}
          <div className="beacon-section">
            <h3>Casper FFG Checkpoints</h3>
            <div className="beacon-info-grid">
              <div className="beacon-info-item">
                <span className="beacon-label">Finalized:</span>
                <span className="beacon-value">
                  {beaconState.finalizedCheckpoint ? (
                    <>
                      Epoch {beaconState.finalizedCheckpoint.epoch}
                      {beaconState.finalizedCheckpoint.root && (
                        <span className="checkpoint-hash"> (...{beaconState.finalizedCheckpoint.root.slice(-8)})</span>
                      )}
                    </>
                  ) : (
                    <span className="empty-checkpoint">None</span>
                  )}
                </span>
              </div>
              <div className="beacon-info-item">
                <span className="beacon-label">Justified:</span>
                <span className="beacon-value">
                  Epoch {beaconState.justifiedCheckpoint.epoch}
                  {beaconState.justifiedCheckpoint.root && (
                    <span className="checkpoint-hash"> (...{beaconState.justifiedCheckpoint.root.slice(-8)})</span>
                  )}
                </span>
              </div>
              <div className="beacon-info-item">
                <span className="beacon-label">Prev Justified:</span>
                <span className="beacon-value">
                  {beaconState.previousJustifiedCheckpoint ? (
                    <>
                      Epoch {beaconState.previousJustifiedCheckpoint.epoch}
                      {beaconState.previousJustifiedCheckpoint.root && (
                        <span className="checkpoint-hash"> (...{beaconState.previousJustifiedCheckpoint.root.slice(-8)})</span>
                      )}
                    </>
                  ) : (
                    <span className="empty-checkpoint">None</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* FFG Vote Counts - Show votes for current epoch targets */}
          <div className="beacon-section">
            <h3>FFG Vote Counts (Current Epoch Targets)</h3>
            <div className="ffg-votes-container">
              {(() => {
                const ffgVoteCounts = beaconState.ffgVoteCounts || {};
                const epochs = Object.keys(ffgVoteCounts).map(Number).sort((a, b) => b - a);
                
                if (epochs.length === 0) {
                  return <p className="empty-message">No FFG votes yet</p>;
                }
                
                return epochs.slice(0, 3).map(epoch => {
                  const targets = ffgVoteCounts[epoch];
                  const targetRoots = Object.keys(targets);
                  
                  return (
                    <div key={epoch} className="epoch-votes">
                      <h4 className="epoch-votes-title">Epoch {epoch}</h4>
                      {targetRoots.map(targetRoot => {
                        const voters = Array.from(targets[targetRoot] || []);
                        const threshold = Math.ceil((2 * validators.length) / 3);
                        const hasThreshold = voters.length >= threshold;
                        
                        return (
                          <div key={targetRoot} className={`target-votes ${hasThreshold ? 'has-threshold' : ''}`}>
                            <div className="target-header">
                              <span className="target-label">Target: ...{targetRoot.slice(-8)}</span>
                              <span className={`vote-count ${hasThreshold ? 'threshold-met' : ''}`}>
                                {voters.length}/{threshold} votes {hasThreshold && '✓'}
                              </span>
                            </div>
                            <div className="voters-list">
                              {voters.map(voterAddress => {
                                const nodeId = addressToNodeId[voterAddress] || 'Unknown';
                                const nodeColor = getNodeColorCSS(nodeId);
                                const nodeEmoji = getNodeColorEmoji(nodeId);
                                return (
                                  <span 
                                    key={voterAddress} 
                                    className="voter-badge"
                                    style={{ 
                                      backgroundColor: nodeColor,
                                      borderColor: nodeColor
                                    }}
                                    title={`${nodeId} (${voterAddress.slice(0, 8)}...)`}
                                  >
                                    {nodeEmoji} {nodeId}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                });
              })()}
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

          {/* Proposer Schedule Timeline - Compact Visualization */}
          <ProposerScheduleTimeline 
            beaconState={beaconState}
            addressToNodeId={addressToNodeId}
          />

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
                    // Find the block being attested - check tree first (includes forks), then canonical chain
                    let attestedBlock = blockchainTree?.getNode(attestation.blockHash)?.block;
                    if (!attestedBlock) {
                      attestedBlock = blockchain.find((b: Block) => b.hash === attestation.blockHash);
                    }
                    
                    // Debug logging
                    if (!attestedBlock) {
                      console.log(`[BeaconStateView] Cannot find block ${attestation.blockHash.slice(0, 8)} - tree has node:`, !!blockchainTree?.getNode(attestation.blockHash), 'canonical has:', blockchain.some((b: Block) => b.hash === attestation.blockHash));
                    }
                    
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
                    // Find the block being attested - check tree first (includes forks), then canonical chain
                    let attestedBlock = blockchainTree?.getNode(attestation.blockHash)?.block;
                    if (!attestedBlock) {
                      attestedBlock = blockchain.find((b: Block) => b.hash === attestation.blockHash);
                    }
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

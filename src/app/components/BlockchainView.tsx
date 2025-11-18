import React, { useState } from 'react';
import { Block, Account } from '../../types/types';
import { ReceiptsDatabase } from '../../types/receipt';
import { calculateBlockHeaderHash } from '../../core/validation/blockValidator';
import TransactionView from './TransactionView';
import AttestationCircle from './AttestationCircle';
import { useSimulatorContext } from '../contexts/SimulatorContext';
import { getNodeColorCSS, getNodeBackgroundTint } from '../../utils/nodeColorUtils';
import { BiFork } from "react-icons/bi";
import { MdContentCopy, MdCheck } from 'react-icons/md';
import './BlockchainView.css';

interface BlockchainViewProps {
  blocks: Block[];
  worldState?: Record<string, Account>; // Optional world state for smart contract display
  receipts?: ReceiptsDatabase; // Optional receipts database
  beaconState?: any; // Optional beacon state for showing finalized checkpoint
  nodeId?: string; // Node ID for background tinting
}

const BlockchainView: React.FC<BlockchainViewProps> = ({ blocks, worldState, receipts, beaconState, nodeId }) => {
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);
  const [selectedAttestation, setSelectedAttestation] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);
  const { forkStartHeight, addressToNodeId } = useSimulatorContext();
  
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
  // Determine if a block is part of a fork
  const isForkedBlock = (block: Block): boolean => {
    if (forkStartHeight === null) return false;
    return block.header.height >= forkStartHeight;
  };
  
  // Check if a block is the finalized Casper FFG checkpoint
  const isFinalizedCheckpoint = (block: Block): boolean => {
    if (!beaconState?.finalizedCheckpoint) return false;
    const blockHash = calculateBlockHeaderHash(block.header);
    return beaconState.finalizedCheckpoint.root === blockHash;
  };
  
  // Check if a block is the LMD-GHOST head
  // The GHOST head is the last block in the canonical chain (highest height)
  const isGhostHead = (block: Block): boolean => {
    if (!blocks || blocks.length === 0) return false;
    
    // Find the block with the highest height (the head of the chain)
    const maxHeight = Math.max(...blocks.map(b => b.header.height));
    const headBlock = blocks.find(b => b.header.height === maxHeight);
    
    if (!headBlock) return false;
    
    const blockHash = calculateBlockHeaderHash(block.header);
    const headHash = calculateBlockHeaderHash(headBlock.header);
    
    return blockHash === headHash;
  };
  
  // Get the last 6 characters of a hash for display
  const shortenHash = (hash: string) => hash.substring(hash.length - 6);
  
  // Sort blocks by height
  const sortedBlocks = [...blocks].sort((a, b) => a.header.height - b.header.height);
  
  // PoS block validation - all blocks are valid by default
  // TODO: Implement BLS signature verification for RANDAO reveals and proposer signatures
  const validateBlockHash = (block: Block) => {
    const hash = calculateBlockHeaderHash(block.header);
    const isValid = true; // PoS blocks don't use PoW hash validation
    const isGenesis = block.header.height === 0;
    return { hash, isValid, isGenesis };
  };
  
  // Create display items including blocks and empty slot placeholders
  const getBlocksForDisplay = () => {
    // Sort blocks by height
    const sorted = [...sortedBlocks].sort((a, b) => a.header.height - b.header.height);
    
    // Create array of display items (blocks + empty slots)
    const displayItems: Array<{ type: 'block' | 'empty-slot', block?: Block, slots?: number[] }> = [];
    
    for (let i = 0; i < sorted.length; i++) {
      const currentBlock = sorted[i];
      const prevBlock = i > 0 ? sorted[i - 1] : null;
      
      // Check for slot gap between consecutive blocks
      if (prevBlock && currentBlock.header.slot > prevBlock.header.slot + 1) {
        const missedSlots: number[] = [];
        for (let slot = prevBlock.header.slot + 1; slot < currentBlock.header.slot; slot++) {
          missedSlots.push(slot);
        }
        
        // Add empty slot placeholder for each missed slot
        for (const slot of missedSlots) {
          displayItems.push({ type: 'empty-slot', slots: [slot] });
        }
      }
      
      // Add the actual block
      displayItems.push({ type: 'block', block: currentBlock });
    }
    
    return displayItems;
  };
  
  // Determine if a block is the last one in the chain (for arrow display)
  const isLastBlock = (index: number, totalBlocks: number) => {
    // Only the very last block should have no outgoing arrow
    return index === totalBlocks - 1;
  };
  
  const sortedBlocksForDisplay = getBlocksForDisplay();
  
  return (
    <div className="blockchain-container" style={{ background: nodeId ? getNodeBackgroundTint(nodeId) : undefined }}>
      <div className="blockchain-row">
        {sortedBlocksForDisplay.map((item, index) => {
            // Handle empty slot placeholders
            if (item.type === 'empty-slot') {
              const slot = item.slots![0];
              return (
                <div 
                  key={`empty-slot-${slot}`}
                  className="empty-slot-item"
                >
                  <div className="empty-slot-content">
                    <div className="empty-slot-label">EMPTY</div>
                    <div className="empty-slot-number">Slot {slot}</div>
                  </div>
                </div>
              );
            }
            
            // Handle actual blocks
            const block = item.block!;
            const { hash, isValid, isGenesis } = validateBlockHash(block);
            const isLast = isLastBlock(index, sortedBlocksForDisplay.length);
            const isFinalized = isFinalizedCheckpoint(block);
            const isGhost = isGhostHead(block);
            const isForked = isForkedBlock(block);
            
            return (
              <div 
                key={hash} 
                className={`block-item ${selectedBlock === block ? 'selected' : ''} ${isGenesis ? 'genesis-block' : ''} ${isLast ? 'last-in-row' : ''} ${isForked ? 'forked-block' : ''} ${isFinalized ? 'finalized-checkpoint' : ''} ${isGhost ? 'ghost-head-block' : ''}`}
                onClick={() => setSelectedBlock(block === selectedBlock ? null : block)}
              >
                <div className="block-height">{block.header.height}</div>
                <div className="block-hash">{shortenHash(hash)}</div>
                <div className="block-validation">
                  {isGenesis ? 
                    <span className="genesis-text">GENESIS</span> :
                    isValid ? 
                      <span className="valid-block">✓</span> : 
                      <span className="invalid-block">✗</span>
                  }
                </div>
                <div className="block-counts-row">
                  <div className="block-tx-count">{block.transactions.length} tx</div>
                  {block.attestations && block.attestations.length > 0 && (
                    <div className="block-attestation-count">{block.attestations.length} att</div>
                  )}
                </div>
                {isForkedBlock(block) && <div className="fork-icon"><BiFork /></div>}
              </div>
            );
          })}
        </div>
      
      {selectedBlock && (
        <div className="block-modal-overlay" onClick={() => setSelectedBlock(null)}>
          <div className="block-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Block {selectedBlock.header.height}</h3>
              <div className="modal-header-actions">
                <button 
                  className="copy-button" 
                  onClick={() => copyToClipboard(JSON.stringify(selectedBlock, null, 2))}
                  title="Copy block data"
                >
                  {copied ? <MdCheck /> : <MdContentCopy />}
                </button>
                <button className="close-button" onClick={() => setSelectedBlock(null)}>×</button>
              </div>
            </div>
            
            <div className="block-modal-content">
              <div className="block-info">
                <div className="info-row">
                  <span className="info-label">Height:</span>
                  <span className="info-value">{selectedBlock.header.height}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Slot:</span>
                  <span className="info-value">{selectedBlock.header.slot}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Hash:</span>
                  <span className="info-value hash-value">0x{calculateBlockHeaderHash(selectedBlock.header)}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Previous Hash:</span>
                  <span className="info-value hash-value">0x{selectedBlock.header.previousHeaderHash}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Nonce:</span>
                  <span className="info-value">{selectedBlock.header.nonce}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Timestamp:</span>
                  <span className="info-value">{new Date(selectedBlock.header.timestamp).toLocaleString()}</span>
                </div>
                {selectedBlock.randaoReveal && (
                  <div className="info-row">
                    <span className="info-label">RANDAO Reveal:</span>
                    <span className="info-value hash-value">{selectedBlock.randaoReveal.slice(0, 16)}...{selectedBlock.randaoReveal.slice(-8)}</span>
                  </div>
                )}
                <div className="modal-row">
                  <div className="modal-label">Valid Hash:</div>
                  <div className="modal-value">
                    {validateBlockHash(selectedBlock).isGenesis ? (
                      <span className="genesis-hash">Genesis Block (Always Valid)</span>
                    ) : validateBlockHash(selectedBlock).isValid ? (
                      <span className="valid-hash">Yes ✓</span>
                    ) : (
                      <span className="invalid-hash">No ✗</span>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="transactions-container">
                <h3>Transactions ({selectedBlock.transactions.length})</h3>
                
                {selectedBlock.transactions.map((tx, index) => {
                  // Look up receipt for this transaction
                  const receipt = receipts && selectedBlock.hash && receipts[selectedBlock.hash] 
                    ? receipts[selectedBlock.hash][tx.txid] 
                    : undefined;
                  
                  return (
                    <TransactionView 
                      key={index} 
                      transaction={tx} 
                      worldState={worldState}
                      receipt={receipt}
                    />
                  );
                })}
              </div>
              
              {/* Attestations Section */}
              {selectedBlock.attestations && Array.isArray(selectedBlock.attestations) && selectedBlock.attestations.length > 0 && (
                <div className="attestations-section">
                  <h3>Included Attestations ({selectedBlock.attestations.length})</h3>
                  <p className="section-description">
                    Attestations are votes from validators supporting blocks in the canonical chain and voting for Casper FFG finality checkpoints.
                  </p>
                  
                  {selectedBlock.attestations.map((attestation: any, index: number) => {
                    const validatorNodeId = addressToNodeId[attestation.validatorAddress] || 'Unknown';
                    const validatorColor = getNodeColorCSS(validatorNodeId);
                    
                    return (
                      <div key={index} className="attestation-card">
                        <div className="attestation-validator-header">
                          <span className="validator-label">Validator:</span>
                          <span 
                            className="validator-name" 
                            style={{ color: validatorColor }}
                          >
                            {validatorNodeId}
                          </span>
                          <span className="validator-address">({attestation.validatorAddress.slice(0, 8)}...{attestation.validatorAddress.slice(-6)})</span>
                        </div>
                        
                        <div className="attestation-subsection">
                          <div className="subsection-title">LMD GHOST Vote</div>
                          <div className="subsection-description">Block this validator is voting for as the chain head</div>
                          <div className="attestation-field">
                            <span className="field-label">Attested Block:</span>
                            <span className="field-value">{attestation.blockHash}</span>
                          </div>
                        </div>
                        
                        {attestation.ffgSource && attestation.ffgTarget && (
                          <div className="attestation-subsection">
                            <div className="subsection-title">Casper FFG Finality Vote</div>
                            <div className="subsection-description">Checkpoint votes for Ethereum's finality mechanism</div>
                            <div className="attestation-field">
                              <span className="field-label">Source Checkpoint:</span>
                              <span className="field-value">Epoch {attestation.ffgSource.epoch} → {attestation.ffgSource.root}</span>
                            </div>
                            <div className="attestation-field">
                              <span className="field-label">Target Checkpoint:</span>
                              <span className="field-value">Epoch {attestation.ffgTarget.epoch} → {attestation.ffgTarget.root}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
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

export default BlockchainView;

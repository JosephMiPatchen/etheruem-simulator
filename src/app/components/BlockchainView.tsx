import React, { useState } from 'react';
import { Block, Account } from '../../types/types';
import { ReceiptsDatabase } from '../../types/receipt';
import { calculateBlockHeaderHash } from '../../core/validation/blockValidator';
import { isHashBelowCeiling } from '../../utils/cryptoUtils';
import { SimulatorConfig } from '../../config/config';
import TransactionView from './TransactionView';
import AttestationCircle from './AttestationCircle';
import { useSimulatorContext } from '../contexts/SimulatorContext';
import { getNodeColorCSS } from '../../utils/nodeColorUtils';
import { BiFork } from "react-icons/bi";
import { MdContentCopy, MdCheck } from 'react-icons/md';
import './BlockchainView.css';

interface BlockchainViewProps {
  blocks: Block[];
  worldState?: Record<string, Account>; // Optional world state for smart contract display
  receipts?: ReceiptsDatabase; // Optional receipts database
}

const BlockchainView: React.FC<BlockchainViewProps> = ({ blocks, worldState, receipts }) => {
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
  
  // Get the last 6 characters of a hash for display
  const shortenHash = (hash: string) => hash.substring(hash.length - 6);
  
  // Sort blocks by height
  const sortedBlocks = [...blocks].sort((a, b) => a.header.height - b.header.height);
  
  // Calculate the hash and check if it's valid
  const validateBlockHash = (block: Block) => {
    const hash = calculateBlockHeaderHash(block.header);
    const isValid = isHashBelowCeiling(hash, SimulatorConfig.CEILING);
    const isGenesis = block.header.height === 0;
    return { hash, isValid, isGenesis };
  };
  
  // Let all blocks display in a single container and let CSS handle the wrapping
  const getBlocksForDisplay = () => {
    // Sort blocks by height
    return [...sortedBlocks].sort((a, b) => a.header.height - b.header.height);
  };
  
  // Determine if a block is the last one in the chain (for arrow display)
  const isLastBlock = (index: number, totalBlocks: number) => {
    // Only the very last block should have no outgoing arrow
    return index === totalBlocks - 1;
  };
  
  const sortedBlocksForDisplay = getBlocksForDisplay();
  
  return (
    <div className="blockchain-container">
      <div className="blockchain-row">
        {sortedBlocksForDisplay.map((block, index) => {
            const { hash, isValid, isGenesis } = validateBlockHash(block);
            const isLast = isLastBlock(index, sortedBlocksForDisplay.length);
            
            return (
              <div 
                key={hash} 
                className={`block-item ${selectedBlock === block ? 'selected' : ''} ${isGenesis ? 'genesis-block' : ''} ${isLast ? 'last-in-row' : ''} ${isForkedBlock(block) ? 'forked-block' : ''}`}
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
                <div className="info-row">
                  <span className="info-label">Ceiling:</span>
                  <span className="info-value hash-value">0x{SimulatorConfig.CEILING}</span>
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
              {selectedBlock.attestations && selectedBlock.attestations.length > 0 && (
                <div className="attestations-container">
                  <h3>Attestations ({selectedBlock.attestations.length})</h3>
                  <div className="attestations-grid-compact">
                    {selectedBlock.attestations.map((attestation, index) => {
                      // Find the block being attested to get its height
                      const attestedBlock = blocks.find((b: Block) => b.hash === attestation.blockHash);
                      const blockHeight = attestedBlock ? attestedBlock.header.height : '?';
                      
                      // Get node name (color) from address using context
                      const nodeName = addressToNodeId[attestation.validatorAddress] || attestation.validatorAddress.slice(-4);
                      
                      // Check if canonical for modal data
                      const isCanonical = blocks.some((b: Block) => b.hash === attestation.blockHash);
                      
                      return (
                        <AttestationCircle
                          key={index}
                          attestation={attestation}
                          blocks={blocks}
                          addressToNodeId={addressToNodeId}
                          onClick={() => setSelectedAttestation({ ...attestation, blockHeight, nodeName, isCanonical })}
                        />
                      );
                    })}
                  </div>
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

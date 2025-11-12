import React, { useMemo, useState } from 'react';
import Tree from 'react-d3-tree';
import { BlockchainTree, BlockTreeNode } from '../../core/blockchain/blockchainTree';
import { Block } from '../../types/types';
import { calculateBlockHeaderHash } from '../../core/validation/blockValidator';
import { isHashBelowCeiling } from '../../utils/cryptoUtils';
import { SimulatorConfig } from '../../config/config';
import TransactionView from './TransactionView';
import AttestationCircle from './AttestationCircle';
import { MdContentCopy, MdCheck } from 'react-icons/md';
import { BiFork } from 'react-icons/bi';
import { useSimulatorContext } from '../contexts/SimulatorContext';
import './BlockTreeView.css';

interface BlockTreeViewProps {
  blockchainTree: BlockchainTree;
  beaconState?: any; // Optional beacon state for showing latest attestations
  onClose: () => void;
}

interface TreeNodeData {
  name: string;
  attributes?: {
    height?: string;
    hash?: string;
    canonical?: string;
  };
  children?: TreeNodeData[];
}

/**
 * BlockTreeView - Visualizes the blockchain tree structure using react-d3-tree
 * Shows null root, all genesis blocks, and all forks with canonical chain highlighted
 */
const BlockTreeView: React.FC<BlockTreeViewProps> = ({ blockchainTree, beaconState, onClose }) => {
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);
  const [isSelectedBlockCanonical, setIsSelectedBlockCanonical] = useState(true);
  const [selectedAttestation, setSelectedAttestation] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);
  const { addressToNodeId } = useSimulatorContext();
  const stats = blockchainTree.getStats();

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const validateBlockHash = (block: Block) => {
    const hash = calculateBlockHeaderHash(block.header);
    const isValid = isHashBelowCeiling(hash, SimulatorConfig.CEILING);
    const isGenesis = block.header.height === 0;
    return { hash, isValid, isGenesis };
  };
  
  // Convert BlockchainTree to react-d3-tree format
  const treeData = useMemo(() => {
    const root = blockchainTree.getRoot();
    const canonicalHead = blockchainTree.getCanonicalHead();
    
    // Build set of canonical node hashes
    const canonicalHashes = new Set<string>();
    let current: BlockTreeNode | null = canonicalHead;
    while (current && !current.isNullRoot) {
      canonicalHashes.add(current.hash);
      current = current.parent;
    }
    
    const convertNode = (node: BlockTreeNode): TreeNodeData => {
      const isCanonical = canonicalHashes.has(node.hash);
      
      if (node.isNullRoot) {
        return {
          name: 'NULL ROOT',
          attributes: {
            canonical: 'root'
          },
          children: node.children.map(convertNode)
        };
      }
      
      if (node.block) {
        const height = node.block.header.height;
        const shortHash = node.hash.slice(-6); // Last 6 characters
        
        return {
          name: `Block ${height}`,
          attributes: {
            height: `${height}`,
            hash: shortHash,
            canonical: isCanonical ? 'yes' : 'no'
          },
          children: node.children.map(convertNode)
        };
      }
      
      return { name: 'Unknown' };
    };
    
    return convertNode(root);
  }, [blockchainTree]);
  
  return (
    <div className="block-tree-modal">
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content block-tree-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>🌳 Blockchain Tree Structure</h2>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
          
          <div className="tree-stats">
            <div className="stat-item">
              <span className="stat-label">Total Blocks:</span>
              <span className="stat-value">{stats.totalBlocks}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Canonical Chain:</span>
              <span className="stat-value">{stats.canonicalChainLength} blocks</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Forks:</span>
              <span className="stat-value">{stats.numberOfForks}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Chain Tips:</span>
              <span className="stat-value">{stats.numberOfLeaves}</span>
            </div>
            <div className="stat-item legend-stat">
              <span className="stat-label">Legend:</span>
              <div className="legend-items">
                <span className="legend-item"><span className="legend-dot root"></span> Null Root</span>
                <span className="legend-item"><span className="legend-dot canonical"></span> Canonical</span>
                <span 
                  className="legend-item" 
                  title="LMD-GHOST HEAD: Latest Message Driven - Greedy Heaviest Observed SubTree. The canonical chain head chosen by following the fork with the most attested ETH at each branch."
                >
                  <span className="legend-dot ghost-head"></span> LMD GHOST HEAD
                </span>
                <span className="legend-item"><span className="legend-dot fork"></span> Fork</span>
                <span className="legend-item legend-attestations">
                  <span className="attestation-color-dot green"></span>
                  <span className="attestation-color-dot yellow"></span>
                  <span className="attestation-color-dot red"></span>
                  <span className="attestation-color-dot blue"></span>
                  Latest Attestations
                </span>
              </div>
            </div>
          </div>
          
          <div className="tree-container">
            <Tree
              data={treeData}
              orientation="vertical"
              pathFunc="step"
              translate={{ x: 400, y: 50 }}
              nodeSize={{ x: 220, y: 120 }}
              separation={{ siblings: 2, nonSiblings: 2.5 }}
              zoom={0.7}
              scaleExtent={{ min: 0.1, max: 2 }}
              enableLegacyTransitions={true}
              pathClassFunc={() => 'tree-link'}
              renderCustomNodeElement={(rd3tProps) => {
                const { nodeDatum } = rd3tProps;
                const isCanonical = nodeDatum.attributes?.canonical === 'yes';
                const isRoot = nodeDatum.attributes?.canonical === 'root';
                
                // Find the actual block from the tree by searching all nodes
                let blockNode: BlockTreeNode | null = null;
                if (nodeDatum.attributes?.hash && !isRoot) {
                  // Search through all nodes in the tree to find matching hash
                  const allNodes = Array.from(blockchainTree['nodesByHash'].values());
                  blockNode = allNodes.find(node => 
                    node.block && node.hash.slice(-6) === nodeDatum.attributes?.hash
                  ) || null;
                }
                
                // Check if this node is the GHOST-HEAD
                const isGhostHead = beaconState && blockNode && beaconState.ghostHead === blockNode.hash;
                
                const handleClick = () => {
                  if (blockNode?.block) {
                    setSelectedBlock(blockNode.block);
                    setIsSelectedBlockCanonical(isCanonical);
                  }
                };
                
                return (
                  <g 
                    onClick={handleClick}
                    style={{ cursor: blockNode?.block ? 'pointer' : 'default' }}
                    className={isCanonical && !isRoot ? 'tree-node canonical-node' : 'tree-node'}
                  >
                    {/* Main circle - larger to fit text */}
                    <circle
                      r={30}
                      fill={isRoot ? '#4d4d4d' : isCanonical ? '#667eea' : '#6c757d'}
                      stroke={isGhostHead ? '#ff9800' : isRoot ? 'none' : isCanonical ? '#764ba2' : '#95a5a6'}
                      strokeWidth={isGhostHead ? 3 : isRoot ? 0 : 2}
                    />
                    
                    {/* LMD GHOST HEAD text for GHOST-HEAD node - positioned to the left */}
                    {isGhostHead && (
                      <g transform="translate(-150, 0)">
                        <foreignObject width="110" height="20">
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            color: '#ff9800',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            whiteSpace: 'nowrap',
                            letterSpacing: '0.5px'
                          }}>
                            LMD GHOST HEAD
                          </div>
                        </foreignObject>
                      </g>
                    )}
                    
                    {/* Fork icon for non-canonical blocks - positioned outside to the right */}
                    {!isCanonical && !isRoot && (
                      <g transform="translate(35, -2)">
                        <foreignObject width="16" height="16">
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            color: '#95a5a6',
                            fontSize: '16px'
                          }}>
                            <BiFork />
                          </div>
                        </foreignObject>
                      </g>
                    )}
                    
                    {/* Attested ETH - blue color with two lines */}
                    {!isRoot && blockNode?.metadata?.attestedEth !== undefined && blockNode.metadata.attestedEth > 0 && (
                      <>
                        <text
                          fill="#667eea"
                          stroke="none"
                          x={!isCanonical ? 55 : 40}
                          y="2"
                          textAnchor="start"
                          fontSize="11"
                          fontWeight="bold"
                          fontFamily="monospace"
                          style={{ pointerEvents: 'none', userSelect: 'none' }}
                        >
                          {blockNode.metadata.attestedEth} ETH
                        </text>
                        <text
                          fill="#667eea"
                          stroke="none"
                          x={!isCanonical ? 55 : 40}
                          y="13"
                          textAnchor="start"
                          fontSize="9"
                          fontWeight="normal"
                          fontFamily="monospace"
                          style={{ pointerEvents: 'none', userSelect: 'none' }}
                        >
                          Attested
                        </text>
                        
                        {/* Attestation circles - with stopPropagation to prevent block modal */}
                        {beaconState && (() => {
                          const attestationsForThisBlock = Array.from(beaconState.latestAttestations?.values() || [])
                            .filter((att: any) => att.blockHash === blockNode.hash);
                          
                          if (attestationsForThisBlock.length === 0) return null;
                          
                          const allBlocks = blockchainTree.getAllBlocks();
                          const baseX = (!isCanonical ? 55 : 40) + 50;
                          
                          return attestationsForThisBlock.map((att: any, idx: number) => {
                            const attestedBlock = allBlocks.find((b: Block) => b.hash === att.blockHash);
                            const blockHeight = attestedBlock ? attestedBlock.header.height : '?';
                            const nodeName = addressToNodeId[att.validatorAddress] || 'Unknown';
                            const isCanonical = allBlocks.some((b: Block) => b.hash === att.blockHash);
                            
                            return (
                              <foreignObject
                                key={`att-circle-${idx}`}
                                x={baseX + (idx * 65)}
                                y="-27"
                                width="60"
                                height="60"
                                onClick={(e: any) => {
                                  e.stopPropagation();
                                  setSelectedAttestation({ ...att, blockHeight, nodeName, isCanonical });
                                }}
                                style={{ cursor: 'pointer' }}
                              >
                                <AttestationCircle
                                  attestation={att}
                                  blocks={allBlocks}
                                  addressToNodeId={addressToNodeId}
                                  simplified={true}
                                  size={55}
                                />
                              </foreignObject>
                            );
                          });
                        })()}
                      </>
                    )}
                    
                    {/* Block name or empty set symbol inside circle */}
                    <text
                      fill="#ffffff"
                      stroke="none"
                      x="0"
                      y="5"
                      textAnchor="middle"
                      fontSize={isRoot ? "24" : "14"}
                      fontWeight="bold"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {isRoot ? '∅' : nodeDatum.name}
                    </text>
                    
                    {/* Hash below circle - white and bold (only for non-root blocks) */}
                    {nodeDatum.attributes?.hash && !isRoot && (
                      <text
                        fill="#ffffff"
                        stroke="none"
                        x="0"
                        y="50"
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="bold"
                        fontFamily="monospace"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {nodeDatum.attributes.hash}
                      </text>
                    )}
                  </g>
                );
              }}
            />
          </div>
        </div>
      </div>

      {/* Block Detail Modal - Using BlockchainView style */}
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

            {/* Non-Canonical Warning Banner */}
            {!isSelectedBlockCanonical && (
              <div className="non-canonical-warning">
                ⚠️ <strong>Warning:</strong> This block is NOT on the canonical chain. It is part of a fork branch that was not selected as the main chain.
              </div>
            )}
            
            <div className="block-modal-content">
              <div className="block-info">
                <div className="info-row">
                  <span className="info-label">Height:</span>
                  <span className="info-value">{selectedBlock.header.height}</span>
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
                
                {selectedBlock.transactions.map((tx, index) => (
                  <TransactionView 
                    key={index} 
                    transaction={tx} 
                  />
                ))}
              </div>
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
                  <span className="info-value" style={{ fontWeight: 'bold' }}>
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
                  <span className="info-label">Canonical:</span>
                  <span className="info-value">{selectedAttestation.isCanonical ? '✓ Yes' : '✗ No'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BlockTreeView;

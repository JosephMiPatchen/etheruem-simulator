import React, { useMemo, useState } from 'react';
import Tree from 'react-d3-tree';
import { BlockchainTree, BlockTreeNode } from '../../core/blockchain/blockchainTree';
import { Block } from '../../types/types';
import { calculateBlockHeaderHash } from '../../core/validation/blockValidator';
import { isHashBelowCeiling } from '../../utils/cryptoUtils';
import { SimulatorConfig } from '../../config/config';
import TransactionView from './TransactionView';
import { MdContentCopy, MdCheck } from 'react-icons/md';
import { BiFork } from 'react-icons/bi';
import './BlockTreeView.css';

interface BlockTreeViewProps {
  blockchainTree: BlockchainTree;
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
const BlockTreeView: React.FC<BlockTreeViewProps> = ({ blockchainTree, onClose }) => {
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);
  const [isSelectedBlockCanonical, setIsSelectedBlockCanonical] = useState(true);
  const [copied, setCopied] = useState(false);
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
          </div>
          
          <div className="tree-container">
            <Tree
              data={treeData}
              orientation="vertical"
              pathFunc="step"
              translate={{ x: 400, y: 80 }}
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
                    {/* Main circle */}
                    <circle
                      r={22}
                      fill={isRoot ? '#4d4d4d' : isCanonical ? '#667eea' : '#6c757d'}
                      stroke={isRoot ? '#ff9800' : isCanonical ? '#764ba2' : '#95a5a6'}
                      strokeWidth={isRoot ? 3 : 2}
                    />
                    
                    {/* Fork icon for non-canonical blocks - positioned below the circle */}
                    {!isCanonical && !isRoot && (
                      <g transform="translate(-6, 28)">
                        <foreignObject width="12" height="12">
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            color: '#95a5a6',
                            fontSize: '12px'
                          }}>
                            <BiFork />
                          </div>
                        </foreignObject>
                      </g>
                    )}
                    
                    {/* Height text */}
                    <text
                      fill="#ffffff"
                      stroke="none"
                      x="0"
                      y="5"
                      textAnchor="middle"
                      fontSize="13"
                      fontWeight="bold"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {nodeDatum.attributes?.height || '∅'}
                    </text>
                    {/* Block name */}
                    <text
                      fill="#ecf0f1"
                      stroke="none"
                      x="0"
                      y="45"
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="500"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {nodeDatum.name}
                    </text>
                    {/* Hash */}
                    {nodeDatum.attributes?.hash && (
                      <text
                        fill="#bdc3c7"
                        stroke="none"
                        x="0"
                        y="60"
                        textAnchor="middle"
                        fontSize="10"
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
          
          <div className="tree-legend">
            <h3>Legend</h3>
            <ul>
              <li><span className="legend-dot root"></span> <strong>Null Root</strong> - Parent of all genesis blocks</li>
              <li><span className="legend-dot canonical"></span> <strong>Canonical</strong> - Block on canonical chain (from HEAD)</li>
              <li><span className="legend-dot fork"></span> <strong>Fork</strong> - Block on non-canonical branch</li>
            </ul>
          </div>
          
          <div className="modal-footer">
            <button className="modal-button" onClick={onClose}>Close</button>
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
    </div>
  );
};

export default BlockTreeView;

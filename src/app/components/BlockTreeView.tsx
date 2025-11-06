import React, { useMemo } from 'react';
import Tree from 'react-d3-tree';
import { BlockchainTree, BlockTreeNode } from '../../core/blockchain/blockchainTree';
import { Block } from '../../types/types';
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
  const [selectedBlock, setSelectedBlock] = React.useState<Block | null>(null);
  const stats = blockchainTree.getStats();
  
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
                
                // Find the actual block from the tree
                const blockHash = nodeDatum.attributes?.hash ? 
                  blockchainTree.getCanonicalChain().find(b => b.hash?.slice(-6) === nodeDatum.attributes?.hash)?.hash || '' : '';
                const blockNode = blockHash ? blockchainTree.getNode(blockHash) : null;
                
                const handleClick = () => {
                  if (blockNode?.block) {
                    setSelectedBlock(blockNode.block);
                  }
                };
                
                return (
                  <g 
                    onClick={handleClick}
                    style={{ cursor: blockNode?.block ? 'pointer' : 'default' }}
                    className="tree-node"
                  >
                    {/* Main circle */}
                    <circle
                      r={22}
                      fill={isRoot ? '#34495e' : isCanonical ? '#27ae60' : '#3498db'}
                      stroke={isRoot ? '#7f8c8d' : isCanonical ? '#2ecc71' : '#5dade2'}
                      strokeWidth={2}
                    />
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

      {/* Block Detail Modal */}
      {selectedBlock && (
        <div className="block-detail-overlay" onClick={() => setSelectedBlock(null)}>
          <div className="block-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="block-detail-header">
              <h3>Block Details</h3>
              <button className="modal-close" onClick={() => setSelectedBlock(null)}>×</button>
            </div>
            <div className="block-detail-content">
              <div className="block-detail-section">
                <h4>Block Header</h4>
                <div className="block-detail-item">
                  <span className="label">Height:</span>
                  <span className="value">{selectedBlock.header.height}</span>
                </div>
                <div className="block-detail-item">
                  <span className="label">Hash:</span>
                  <span className="value monospace">{selectedBlock.hash}</span>
                </div>
                <div className="block-detail-item">
                  <span className="label">Previous Hash:</span>
                  <span className="value monospace">{selectedBlock.header.previousHeaderHash}</span>
                </div>
                <div className="block-detail-item">
                  <span className="label">Timestamp:</span>
                  <span className="value">{new Date(selectedBlock.header.timestamp).toLocaleString()}</span>
                </div>
                <div className="block-detail-item">
                  <span className="label">Nonce:</span>
                  <span className="value">{selectedBlock.header.nonce}</span>
                </div>
                {(selectedBlock.header as any).difficulty !== undefined && (
                  <div className="block-detail-item">
                    <span className="label">Difficulty:</span>
                    <span className="value">{(selectedBlock.header as any).difficulty}</span>
                  </div>
                )}
                {(selectedBlock.header as any).miner && (
                  <div className="block-detail-item">
                    <span className="label">Miner:</span>
                    <span className="value monospace">{(selectedBlock.header as any).miner}</span>
                  </div>
                )}
              </div>
              
              <div className="block-detail-section">
                <h4>Transactions ({selectedBlock.transactions.length})</h4>
                {selectedBlock.transactions.length === 0 ? (
                  <p className="empty-message">No transactions in this block</p>
                ) : (
                  <div className="transactions-list">
                    {selectedBlock.transactions.map((tx, idx) => (
                      <div key={tx.txid || idx} className="transaction-item">
                        <div className="tx-header">Transaction #{idx + 1}</div>
                        <div className="tx-detail">
                          <span className="label">TXID:</span>
                          <span className="value monospace">{tx.txid}</span>
                        </div>
                        <div className="tx-detail">
                          <span className="label">From:</span>
                          <span className="value monospace">{tx.from}</span>
                        </div>
                        <div className="tx-detail">
                          <span className="label">To:</span>
                          <span className="value monospace">{tx.to}</span>
                        </div>
                        <div className="tx-detail">
                          <span className="label">Value:</span>
                          <span className="value">{tx.value} ETH</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="block-detail-footer">
              <button className="modal-button" onClick={() => setSelectedBlock(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BlockTreeView;

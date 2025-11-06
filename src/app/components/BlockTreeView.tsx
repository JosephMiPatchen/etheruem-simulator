import React, { useMemo } from 'react';
import Tree from 'react-d3-tree';
import { BlockchainTree, BlockTreeNode } from '../../core/blockchain/blockchainTree';
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
              translate={{ x: 400, y: 50 }}
              nodeSize={{ x: 200, y: 100 }}
              separation={{ siblings: 1.5, nonSiblings: 2 }}
              zoom={0.8}
              scaleExtent={{ min: 0.1, max: 2 }}
              enableLegacyTransitions={true}
              pathClassFunc={() => 'tree-link'}
              renderCustomNodeElement={(rd3tProps) => {
                const { nodeDatum } = rd3tProps;
                const isCanonical = nodeDatum.attributes?.canonical === 'yes';
                const isRoot = nodeDatum.attributes?.canonical === 'root';
                
                return (
                  <g>
                    {/* Outer glow effect */}
                    <circle
                      r={24}
                      fill="none"
                      stroke={isRoot ? 'rgba(108, 117, 125, 0.3)' : isCanonical ? 'rgba(0, 255, 157, 0.4)' : 'rgba(0, 191, 255, 0.4)'}
                      strokeWidth={3}
                      opacity={0.6}
                    />
                    {/* Main circle */}
                    <circle
                      r={20}
                      fill={isRoot ? '#2c3e50' : isCanonical ? '#1a4d2e' : '#1e3a5f'}
                      stroke={isRoot ? '#6c757d' : isCanonical ? '#00ff9d' : '#00bfff'}
                      strokeWidth={2}
                    />
                    {/* Height text */}
                    <text
                      fill={isRoot ? '#95a5a6' : isCanonical ? '#00ff9d' : '#00bfff'}
                      strokeWidth="0"
                      x="0"
                      y="5"
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="bold"
                    >
                      {nodeDatum.attributes?.height || '∅'}
                    </text>
                    {/* Block name */}
                    <text
                      fill="#ecf0f1"
                      x="0"
                      y="40"
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="500"
                    >
                      {nodeDatum.name}
                    </text>
                    {/* Hash */}
                    {nodeDatum.attributes?.hash && (
                      <text
                        fill="#95a5a6"
                        x="0"
                        y="55"
                        textAnchor="middle"
                        fontSize="9"
                        fontFamily="monospace"
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
    </div>
  );
};

export default BlockTreeView;

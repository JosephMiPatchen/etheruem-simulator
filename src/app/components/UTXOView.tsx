import React, { useState, useEffect, useMemo } from 'react';
import { UTXOSet, TransactionOutput } from '../../types/types';
import Select from 'react-select';
import './UTXOView.css';

// Icons for copy buttons
const CopyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
);

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

interface UTXOViewProps {
  utxoSet: UTXOSet;
  allNodeIds?: string[];
  nodeId?: string; // Current node ID for which the modal is opened
}

// Define the option type for react-select
interface NodeOption {
  value: string;
  label: string;
}

const UTXOView: React.FC<UTXOViewProps> = ({ utxoSet, allNodeIds = [], nodeId }) => {
  const [selectedNodes, setSelectedNodes] = useState<NodeOption[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const itemsPerPage = 10;

  // Extract unique node IDs from the UTXO set if not provided
  const uniqueNodeIds = useMemo(() => {
    if (allNodeIds && allNodeIds.length > 0) return allNodeIds;
    
    // Extract unique node IDs from UTXO set
    const nodeIds = new Set<string>();
    Object.values(utxoSet).forEach(output => {
      nodeIds.add(output.nodeId);
    });
    return Array.from(nodeIds).sort();
  }, [utxoSet, allNodeIds]);
  
  // Create options for react-select
  const nodeOptions = useMemo(() => {
    return uniqueNodeIds.map(nodeId => ({
      value: nodeId,
      label: nodeId
    }));
  }, [uniqueNodeIds]);
  
  // Use useMemo to calculate filtered UTXOs only when utxoSet or selected nodes change
  const filteredUtxos = useMemo(() => {
    const utxoEntries = Object.entries(utxoSet);
    
    // If no nodes are selected, show all UTXOs
    if (selectedNodes.length === 0) {
      return utxoEntries;
    }
    
    // Create a Set of selected node IDs for faster lookup
    const selectedNodeIds = new Set(selectedNodes.map(node => node.value));
    
    // Filter UTXOs by selected node IDs
    return utxoEntries.filter(([_, output]) => {
      return selectedNodeIds.has(output.nodeId);
    });
  }, [utxoSet, selectedNodes]);
  
  // Reset to page 1 when selected nodes change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedNodes]);

  // Calculate total BTC owned by the current node
  const nodeTotalBtc = useMemo(() => {
    if (!nodeId) return 0;
    
    return Object.values(utxoSet)
      .filter(output => output.nodeId === nodeId)
      .reduce((total, output) => total + output.value, 0);
  }, [utxoSet, nodeId]);

  // Calculate pagination values using useMemo to prevent unnecessary recalculations
  const { totalPages, currentUtxos } = useMemo(() => {
    const totalPages = Math.ceil(filteredUtxos.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentUtxos = filteredUtxos.slice(startIndex, endIndex);
    
    return { totalPages, currentUtxos };
  }, [filteredUtxos, currentPage, itemsPerPage]);

  // Handle pagination
  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  // Format UTXO ID for display (truncate if too long)
  const formatUtxoId = (utxoId: string) => {
    if (utxoId.length > 20) {
      return `${utxoId.substring(0, 10)}...${utxoId.substring(utxoId.length - 10)}`;
    }
    return utxoId;
  };

  // Format address for display (truncate if too long)
  const formatAddress = (address: string) => {
    if (address.length > 20) {
      return `${address.substring(0, 10)}...${address.substring(address.length - 10)}`;
    }
    return address;
  };

  // Copy a single UTXO to clipboard
  const copyToClipboard = (utxoId: string, output: TransactionOutput) => {
    const utxoData = {
      id: utxoId,
      nodeId: output.nodeId,
      value: output.value,
      address: output.lock
    };
    
    navigator.clipboard.writeText(JSON.stringify(utxoData, null, 2))
      .then(() => {
        setCopiedItem(utxoId);
        setTimeout(() => setCopiedItem(null), 2000);
      })
      .catch(err => console.error('Failed to copy: ', err));
  };
  
  // Copy entire UTXO set to clipboard
  const copyAllToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(utxoSet, null, 2))
      .then(() => {
        setCopiedAll(true);
        setTimeout(() => setCopiedAll(false), 2000);
      })
      .catch(err => console.error('Failed to copy all: ', err));
  };

  return (
    <div className="utxo-view">
      <div className="utxo-header-actions">
        <div className="utxo-title-container">
          <h3 className="utxo-title">UTXO Set</h3>
          <div className="utxo-stats">
            <div className="utxo-count">
              Total UTXOs: <span className="utxo-stat-value">{Object.keys(utxoSet).length}</span>
            </div>
            {nodeId && (
              <div className="node-total-btc">
                Node Balance: <span className="btc-value">{nodeTotalBtc.toFixed(2)} BTC</span>
              </div>
            )}
          </div>
        </div>
        <button 
          className="copy-all-button" 
          onClick={copyAllToClipboard}
          title="Copy entire UTXO set as JSON"
        >
          {copiedAll ? <span className="copied-text"><CheckIcon /> Copied!</span> : <span><CopyIcon /> Copy All</span>}
        </button>
      </div>
      <div className="utxo-filters">
        <div className="utxo-filter utxo-filter-full">
          <label className="utxo-filter-label">Filter by Node IDs</label>
          <div className="filter-row">
            <Select
              isMulti
              name="nodeIds"
              options={nodeOptions}
              className="react-select-container"
              classNamePrefix="react-select"
              placeholder="Select node IDs to filter..."
              value={selectedNodes}
              onChange={(selected) => setSelectedNodes(selected as NodeOption[])}
              isClearable={true}
              isSearchable={true}
            />
            
            {selectedNodes.length > 0 && (
              <button 
                className="utxo-filter-reset" 
                onClick={() => setSelectedNodes([])}
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="utxo-header">
        <div className="utxo-id-header">UTXO ID</div>
        <div className="utxo-node-header">Node ID</div>
        <div className="utxo-value-header">Value</div>
        <div className="utxo-address-header">Address</div>
        <div className="utxo-actions-header">Actions</div>
      </div>

      <div className="utxo-list">
        {currentUtxos.length > 0 ? (
          currentUtxos.map(([utxoId, output]: [string, TransactionOutput]) => (
            <div key={utxoId} className="utxo-item">
              <div className="utxo-id" title={utxoId}>{formatUtxoId(utxoId)}</div>
              <div className="utxo-node">{output.nodeId}</div>
              <div className="utxo-value">{output.value.toFixed(2)} BTC</div>
              <div className="utxo-address" title={output.lock}>{formatAddress(output.lock)}</div>
              <div className="utxo-actions">
                <button 
                  className="copy-button" 
                  onClick={() => copyToClipboard(utxoId, output)}
                  title="Copy UTXO data as JSON"
                >
                  {copiedItem === utxoId ? <CheckIcon /> : <CopyIcon />}
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="utxo-empty">
            {selectedNodes.length > 0 
              ? 'No UTXOs found for the selected nodes' 
              : 'No UTXOs available'}
          </div>
        )}
      </div>

      {filteredUtxos.length > 0 && (
        <div className="utxo-pagination">
          <button 
            onClick={handlePrevPage} 
            disabled={currentPage === 1}
            className="pagination-button"
          >
            &lt; Prev
          </button>
          <span className="pagination-info">
            Page {currentPage} of {totalPages} 
            ({filteredUtxos.length} UTXOs)
          </span>
          <button 
            onClick={handleNextPage} 
            disabled={currentPage === totalPages}
            className="pagination-button"
          >
            Next &gt;
          </button>
        </div>
      )}
    </div>
  );
};

export default UTXOView;

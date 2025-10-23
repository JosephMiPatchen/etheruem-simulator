import React, { useState, useEffect, useMemo } from 'react';
import { Account } from '../../types/types';
import Select from 'react-select';
import { useSimulatorContext } from '../contexts/SimulatorContext';
import EPMDisplay from './EPMDisplay';
import './WorldStateView.css';

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

interface WorldStateViewProps {
  worldState: Record<string, Account>; // Address -> Account mapping
  allNodeIds?: string[];
  nodeId?: string; // Current node ID for which the modal is opened
}

// Define the option type for react-select
interface NodeOption {
  value: string;
  label: string;
}

const WorldStateView: React.FC<WorldStateViewProps> = ({ worldState, allNodeIds = [], nodeId }) => {
  const { addressToNodeId } = useSimulatorContext();
  const [selectedNodes, setSelectedNodes] = useState<NodeOption[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Account | null>(null);
  const itemsPerPage = 10;

  // Extract unique node IDs from the world state using address mapping
  const uniqueNodeIds = useMemo(() => {
    if (allNodeIds && allNodeIds.length > 0) return allNodeIds;
    
    // Extract unique node IDs from address mapping
    const nodeIds = new Set(Object.values(addressToNodeId));
    return Array.from(nodeIds).sort();
  }, [addressToNodeId, allNodeIds]);
  
  // Create options for react-select
  const nodeOptions = useMemo(() => {
    return uniqueNodeIds.map(nodeId => ({
      value: nodeId,
      label: nodeId
    }));
  }, [uniqueNodeIds]);
  
  // Convert worldState to array of [address, account] with nodeId for filtering
  const accountsWithNodeIds = useMemo(() => {
    return Object.entries(worldState).map(([address, account]) => ({
      address,
      account,
      nodeId: addressToNodeId[address] || 'Unknown'
    }));
  }, [worldState, addressToNodeId]);
  
  // Filter accounts by selected nodes
  const filteredAccounts = useMemo(() => {
    // If no nodes are selected, show all accounts
    if (selectedNodes.length === 0) {
      return accountsWithNodeIds;
    }
    
    // Create a Set of selected node IDs for faster lookup
    const selectedNodeIds = new Set(selectedNodes.map(node => node.value));
    
    // Filter accounts by selected node IDs
    return accountsWithNodeIds.filter(item => selectedNodeIds.has(item.nodeId));
  }, [accountsWithNodeIds, selectedNodes]);
  
  // Reset to page 1 when selected nodes change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedNodes]);

  // Find the address for this node
  const nodeAddress = useMemo(() => {
    if (!nodeId) return undefined;
    return Object.entries(addressToNodeId)
      .find(([_, nId]) => nId === nodeId)?.[0];
  }, [addressToNodeId, nodeId]);
  
  // Get the account balance - updates only when the actual balance changes
  const totalEth = nodeAddress ? (worldState[nodeAddress]?.balance || 0) : 0;

  // Calculate pagination values using useMemo to prevent unnecessary recalculations
  const { totalPages, currentAccounts } = useMemo(() => {
    const totalPages = Math.ceil(filteredAccounts.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentAccounts = filteredAccounts.slice(startIndex, endIndex);
    
    return { totalPages, currentAccounts };
  }, [filteredAccounts, currentPage, itemsPerPage]);

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

  // Format address for display (truncate if too long)
  const formatAddress = (address: string) => {
    if (address.length > 20) {
      return `${address.substring(0, 10)}...${address.substring(address.length - 10)}`;
    }
    return address;
  };

  // Copy a single account to clipboard
  const copyToClipboard = (address: string, account: Account) => {
    const accountData = {
      address,
      nodeId: addressToNodeId[address] || 'Unknown',
      balance: account.balance,
      nonce: account.nonce
    };
    
    navigator.clipboard.writeText(JSON.stringify(accountData, null, 2))
      .then(() => {
        setCopiedItem(address);
        setTimeout(() => setCopiedItem(null), 2000);
      })
      .catch(err => console.error('Failed to copy: ', err));
  };
  
  // Copy entire world state to clipboard
  const copyAllToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(worldState, null, 2))
      .then(() => {
        setCopiedAll(true);
        setTimeout(() => setCopiedAll(false), 2000);
      })
      .catch(err => console.error('Failed to copy all: ', err));
  };

  return (
    <>
      <div className="utxo-view">
        <div className="utxo-header-actions">
        <div className="utxo-title-container">
          <h3 className="utxo-title">World State</h3>
          <div className="utxo-stats">
            <div className="utxo-count">
              Total Accounts: <span className="utxo-stat-value">{Object.keys(worldState).length}</span>
            </div>
            {nodeId && (
              <div className="node-total-eth">
                Node Balance: <span className="eth-value">{totalEth.toFixed(2)} ETH</span>
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
        <div className="utxo-id-header">Address</div>
        <div className="utxo-node-header">Node ID</div>
        <div className="utxo-value-header">Balance</div>
        <div className="utxo-address-header">Nonce</div>
        <div className="utxo-actions-header">Actions</div>
      </div>

      <div className="utxo-list">
        {currentAccounts.length > 0 ? (
          currentAccounts.map(({ address, account, nodeId: accountNodeId }) => {
            // Check if this is a smart contract (has code field)
            const isSmartContract = account.code && account.code.length > 0;
            const displayNodeId = isSmartContract ? 'Smart Contract' : accountNodeId;
            
            return (
              <div key={address} className="utxo-item">
                <div className="utxo-id" title={address}>{formatAddress(address)}</div>
                <div className="utxo-node">
                  {isSmartContract ? (
                    <button 
                      className="smart-contract-button"
                      onClick={() => setSelectedContract(account)}
                      title="View Smart Contract"
                    >
                      {displayNodeId}
                    </button>
                  ) : (
                    displayNodeId
                  )}
                </div>
                <div className="utxo-value">{account.balance.toFixed(2)} ETH</div>
                <div className="utxo-address">{account.nonce}</div>
                <div className="utxo-actions">
                  <button 
                    className="copy-button" 
                    onClick={() => copyToClipboard(address, account)}
                    title="Copy account data as JSON"
                  >
                    {copiedItem === address ? <CheckIcon /> : <CopyIcon />}
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="utxo-empty">
            {selectedNodes.length > 0 
              ? 'No accounts found for the selected nodes' 
              : 'No accounts available'}
          </div>
        )}
      </div>

      {filteredAccounts.length > 0 && (
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
            ({filteredAccounts.length} Accounts)
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
      
      {/* Smart Contract Modal */}
      {selectedContract && (
        <div className="smart-contract-modal-overlay" onClick={() => setSelectedContract(null)}>
          <div className="smart-contract-modal" onClick={(e) => e.stopPropagation()}>
            <div className="smart-contract-modal-header">
              <h2>Smart Contract: {selectedContract.code}</h2>
              <button 
                className="smart-contract-modal-close"
                onClick={() => setSelectedContract(null)}
              >
                ×
              </button>
            </div>
            <div className="smart-contract-modal-content">
              <EPMDisplay account={selectedContract} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default WorldStateView;

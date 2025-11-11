import React from 'react';
import { Attestation, Block } from '../../types/types';
import { getNodeColorCSS } from '../../utils/nodeColorUtils';
import './AttestationCircle.css';

interface AttestationCircleProps {
  attestation: Attestation;
  blocks: Block[];
  addressToNodeId: Record<string, string>;
  onClick?: () => void;
  simplified?: boolean; // Optional: show simplified view for block tree
}

const AttestationCircle: React.FC<AttestationCircleProps> = ({ 
  attestation, 
  blocks, 
  addressToNodeId,
  onClick,
  simplified = false
}) => {
  // Check if this attestation's block hash is in the canonical chain
  const isCanonical = blocks.some((b: Block) => b.hash === attestation.blockHash);
  
  // Find the block being attested to get its height
  const attestedBlock = blocks.find((b: Block) => b.hash === attestation.blockHash);
  const blockHeight = attestedBlock ? attestedBlock.header.height : '?';
  
  // Get node name (color) from address using context
  const nodeName = addressToNodeId[attestation.validatorAddress] || attestation.validatorAddress.slice(-4);
  const nodeColor = getNodeColorCSS(nodeName);
  
  // Get last 6 hex characters of block hash
  const hashSuffix = attestation.blockHash.slice(-6);
  
  // Simplified view for block tree
  if (simplified) {
    return (
      <div 
        className="attestation-circle attestation-simplified"
        style={{ borderColor: nodeColor }}
        title={`Validator: ${nodeName}\nBlock: ${attestation.blockHash}\nHeight: ${blockHeight}`}
        onClick={onClick}
      >
        <div className="attestation-circle-content">
          <div className="attestation-node-name" style={{ color: nodeColor }}>{nodeName}</div>
          <div className="attestation-label">Attest</div>
        </div>
      </div>
    );
  }
  
  // Default view
  return (
    <div 
      className={`attestation-circle ${isCanonical ? 'attestation-canonical' : ''}`}
      style={{ borderColor: nodeColor }}
      title={`Validator: ${nodeName}\nBlock: ${attestation.blockHash}\nHeight: ${blockHeight}`}
      onClick={onClick}
    >
      <div className="attestation-circle-content">
        <div className="attestation-block-label">Block</div>
        <div className="attestation-block-number">{blockHeight}</div>
        <div className="attestation-hash-suffix">{hashSuffix}</div>
        {isCanonical && <div className="attestation-check">✓</div>}
      </div>
    </div>
  );
};

export default AttestationCircle;

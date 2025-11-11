import { Block } from '../types/types';
import { BlockchainTree, BlockTreeNode } from './blockchain/blockchainTree';

/**
 * LMD-GHOST (Latest Message Driven Greedy Heaviest Observed SubTree)
 * 
 * This class handles all fork choice logic for the Ethereum-style blockchain:
 * - Maintains latest attestations from validators
 * - Decorates blockchain tree with attestedEth (cumulative attested weight)
 * - Provides fork choice state for UI and consensus
 */
export class LmdGhost {
  // Map of validator address to their latest attestation
  private latestAttestations: Map<string, Attestation>;
  
  constructor() {
    this.latestAttestations = new Map();
  }
  
  /**
   * Record a new attestation from a validator
   * Updates the latest attestation for this validator
   */
  public recordAttestation(attestation: Attestation): void {
    const existing = this.latestAttestations.get(attestation.validatorAddress);
    
    // Only update if this attestation is newer
    if (!existing || attestation.timestamp > existing.timestamp) {
      this.latestAttestations.set(attestation.validatorAddress, attestation);
    }
  }
  
  /**
   * Get all latest attestations
   */
  public getLatestAttestations(): Map<string, Attestation> {
    return new Map(this.latestAttestations);
  }
  
  /**
   * Clear all attestations (e.g., on chain replacement)
   */
  public clearAttestations(): void {
    this.latestAttestations.clear();
  }
  
  /**
   * Decorate a blockchain tree with attestedEth metadata
   * Computes cumulative attested weight for each block in the tree
   */
  public decorateTree(tree: BlockchainTree): void {
    // Get all blocks from the tree
    const allBlocks = tree.getAllBlocks();
    
    // Create a map of block hash to attestation count
    const blockAttestationCounts = new Map<string, number>();
    
    // Count attestations for each block
    for (const attestation of this.latestAttestations.values()) {
      const count = blockAttestationCounts.get(attestation.blockHash) || 0;
      blockAttestationCounts.set(attestation.blockHash, count + 1);
    }
    
    // Decorate each node in the tree with attestedEth
    this.decorateNode(tree.getRoot(), blockAttestationCounts, allBlocks);
  }
  
  /**
   * Recursively decorate a tree node and its descendants with attestedEth
   */
  private decorateNode(
    node: BlockTreeNode | null,
    blockAttestationCounts: Map<string, number>,
    allBlocks: Block[]
  ): number {
    if (!node) return 0;
    
    // Get direct attestations for this block (32 ETH per attestation)
    const directAttestations = blockAttestationCounts.get(node.hash) || 0;
    const directAttestedEth = directAttestations * 32;
    
    // Recursively compute attestedEth for all children
    let childrenAttestedEth = 0;
    for (const child of node.children) {
      childrenAttestedEth += this.decorateNode(child, blockAttestationCounts, allBlocks);
    }
    
    // Total attestedEth is direct + all descendants
    const totalAttestedEth = directAttestedEth + childrenAttestedEth;
    
    // Store in node metadata
    if (!node.metadata) {
      node.metadata = {};
    }
    node.metadata.attestedEth = totalAttestedEth;
    
    return totalAttestedEth;
  }
  
  /**
   * Get attestations pointing to a specific block
   */
  public getAttestationsForBlock(blockHash: string): Attestation[] {
    const attestations: Attestation[] = [];
    
    for (const attestation of this.latestAttestations.values()) {
      if (attestation.blockHash === blockHash) {
        attestations.push(attestation);
      }
    }
    
    return attestations;
  }
  
  /**
   * Get the total attested ETH for a specific block
   * (direct attestations only, not including descendants)
   */
  public getDirectAttestedEth(blockHash: string): number {
    const attestations = this.getAttestationsForBlock(blockHash);
    return attestations.length * 32; // 32 ETH per attestation
  }
}

/**
 * Attestation type for LMD-GHOST
 */
export interface Attestation {
  validatorAddress: string;
  blockHash: string;
  timestamp: number;
}

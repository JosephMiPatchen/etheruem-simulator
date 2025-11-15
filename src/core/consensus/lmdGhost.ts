import { Block } from '../../types/types';
import { BlockchainTree, BlockTreeNode } from '../blockchain/blockchainTree';

/**
 * LMD-GHOST (Latest Message Driven Greedy Heaviest Observed SubTree)
 * 
 * Static utility class for fork choice logic in Ethereum-style blockchain:
 * - Manages latest attestations from validators (stored in BeaconState)
 * - Decorates blockchain tree with attestedEth (cumulative attested weight)
 * - Computes GHOST-HEAD for fork choice
 * 
 * All state is stored in BeaconState, methods are pure/static
 */
export class LmdGhost {
  /**
   * Record a new attestation from a validator
   * Updates the latest attestation for this validator in BeaconState
   */
  public static recordAttestation(beaconState: any, attestation: Attestation): void {
    const existing = beaconState.latestAttestations.get(attestation.validatorAddress);
    
    // Only update if this attestation is newer
    if (!existing || attestation.timestamp > existing.timestamp) {
      beaconState.latestAttestations.set(attestation.validatorAddress, attestation);
    }
  }
  
  /**
   * Clear all attestations (e.g., on chain replacement)
   */
  public static clearAttestations(beaconState: any): void {
    beaconState.latestAttestations.clear();
  }
  
  /**
   * Decorate a blockchain tree with attestedEth metadata
   * Computes cumulative attested weight for each block in the tree
   */
  public static decorateTree(beaconState: any, tree: BlockchainTree): void {    
    // Create a map of block hash to attestation count
    const blockAttestationCounts = new Map<string, number>();
    
    // Count attestations for each block
    for (const attestation of beaconState.latestAttestations.values()) {
      const count = blockAttestationCounts.get(attestation.blockHash) || 0;
      blockAttestationCounts.set(attestation.blockHash, count + 1);
    }
    
    // Debug: Log attestation counts
    console.log(`[LmdGhost] decorateTree called with ${beaconState.latestAttestations.size} attestations pointing to ${blockAttestationCounts.size} blocks:`, 
      Array.from(blockAttestationCounts.entries()).map(([hash, count]) => `${hash.slice(0, 8)}:${count}`).join(', '));
    
    // Decorate each node in the tree with attestedEth
    LmdGhost.decorateNode(tree.getRoot(), blockAttestationCounts);
  }
  
  /**
   * Recursively decorate a tree node and its descendants with attestedEth
   * Invalid nodes get 0 attestedEth and don't contribute to their parents
   */
  private static decorateNode(
    node: BlockTreeNode | null,
    blockAttestationCounts: Map<string, number>
  ): number {
    if (!node) return 0;
    
    // Invalid nodes have 0 attestedEth and don't contribute to parents
    if (node.metadata?.isInvalid) {
      node.metadata.attestedEth = 0;
      return 0;
    }
    
    // Get direct attestations for this block (32 ETH per attestation)
    const directAttestations = blockAttestationCounts.get(node.hash) || 0;
    const directAttestedEth = directAttestations * 32; // TODO: get this from the validtor set in beacon state
    
    // Recursively compute attestedEth for all children (skips invalid children)
    let childrenAttestedEth = 0;
    for (const child of node.children) {
      childrenAttestedEth += LmdGhost.decorateNode(child, blockAttestationCounts);
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
  public static getAttestationsForBlock(beaconState: any, blockHash: string): Attestation[] {
    const attestations: Attestation[] = [];
    
    for (const attestation of beaconState.latestAttestations.values()) {
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
  public static getDirectAttestedEth(beaconState: any, blockHash: string): number {
    const attestations = LmdGhost.getAttestationsForBlock(beaconState, blockHash);
    return attestations.length * 32; // TODO: get this from the validtor set in beacon state
  }
  
  /**
   * Handle attestation set changes
   * This is called whenever:
   * - New attestations arrive in beacon pool
   * - Blocks are added to blockchain
   * - Chain is replaced
   * 
   * Consolidates all logic that needs to happen when attestations change:
   * 1. Update latest attestations from all sources
   * 2. Decorate tree with attestedEth
   * 3. Compute and update GHOST-HEAD (stored in tree)
   */
  public static onAttestationSetChanged(
    beaconState: any,
    tree: BlockchainTree,
    allAttestations: Attestation[]
  ): void {
    // 1. Update latest attestations for each validator
    for (const attestation of allAttestations) {
      LmdGhost.recordAttestation(beaconState, attestation);
    }
    
    // 2. Decorate tree with attestedEth
    LmdGhost.decorateTree(beaconState, tree);
    
    // Note: GHOST-HEAD is computed on-demand via tree.getGhostHead()
    // No need to set it here - it will be recomputed when needed
  }
  
  /**
   * Compute GHOST-HEAD using LMD-GHOST fork choice rule
   * Returns the block hash of the canonical chain head
   * 
   * Algorithm:
   * 1. Start at genesis (tree root)
   * 2. At each fork, choose the child with highest attestedEth
   * 3. Continue until reaching a leaf (chain tip)
   */
  public static computeGhostHead(tree: BlockchainTree): string | null {
    const root = tree.getRoot();
    if (!root) return null;
    
    // Start at root and follow the heaviest valid path
    let current = root;
    
    while (current.children.length > 0) {
      // Filter out invalid children (blocks that failed validation)
      const validChildren = current.children.filter(child => !child.metadata?.isInvalid);
      
      if (validChildren.length === 0) {
        // No valid children - current node is the GHOST-HEAD
        break;
      }
      
      // Find valid child with highest attestedEth
      let heaviestChild = validChildren[0];
      let maxAttestedEth = heaviestChild.metadata?.attestedEth || 0;
      
      for (let i = 1; i < validChildren.length; i++) {
        const child = validChildren[i];
        const childAttestedEth = child.metadata?.attestedEth || 0;
        
        if (childAttestedEth > maxAttestedEth) {
          heaviestChild = child;
          maxAttestedEth = childAttestedEth;
        }
      }
      
      current = heaviestChild;
    }
    
    // Return the hash of the leaf node (chain tip)
    return current.hash;
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

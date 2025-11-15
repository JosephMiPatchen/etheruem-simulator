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
   * Record a new attestation from a validator and incrementally update tree decorations
   * This is the core method that maintains attestedEth values in the tree
   * 
   * @param beaconState - Beacon state containing latest attestations
   * @param tree - Blockchain tree to update
   * @param attestation - New attestation to record
   */
  public static recordAttestation(beaconState: any, tree: BlockchainTree, attestation: Attestation): void {
    const existing = beaconState.latestAttestations.get(attestation.validatorAddress);
    
    // Only update if this attestation is newer
    if (!existing || attestation.timestamp > existing.timestamp) {
      // a) Decrement attestedEth for old attestation (if it points to a node in tree)
      if (existing) {
        const oldNode = tree.getNode(existing.blockHash);
        if (oldNode) {
          LmdGhost.decrementAttestedEth(oldNode);
        }
      }
      
      // Update latest attestation
      beaconState.latestAttestations.set(attestation.validatorAddress, attestation);
      
      // b) Increment attestedEth for new attestation (if it points to a node in tree)
      const newNode = tree.getNode(attestation.blockHash);
      if (newNode) {
        LmdGhost.incrementAttestedEth(newNode);
      }
    }
  }
  
  /**
   * Increment attestedEth from a node up to root
   * Called when a new attestation points to this node
   */
  private static incrementAttestedEth(node: BlockTreeNode): void {
    const attestedEthToAdd = 32; // 32 ETH per attestation
    let current: BlockTreeNode | null = node;
    
    while (current) {
      if (!current.metadata) {
        current.metadata = {};
      }
      current.metadata.attestedEth = (current.metadata.attestedEth || 0) + attestedEthToAdd;
      current = current.parent;
    }
  }
  
  /**
   * Decrement attestedEth from a node up to root
   * Called when an old attestation is replaced
   */
  private static decrementAttestedEth(node: BlockTreeNode): void {
    const attestedEthToRemove = 32; // 32 ETH per attestation
    let current: BlockTreeNode | null = node;
    
    while (current) {
      if (current.metadata) {
        current.metadata.attestedEth = Math.max(0, (current.metadata.attestedEth || 0) - attestedEthToRemove);
      }
      current = current.parent;
    }
  }
  
  /**
   * Clear all attestations and reset tree decorations
   */
  public static clearAttestations(beaconState: any, tree: BlockchainTree): void {
    beaconState.latestAttestations.clear();
    
    // Reset all attestedEth values in tree
    const root = tree.getRoot();
    if (root) {
      LmdGhost.resetAttestedEth(root);
    }
  }
  
  /**
   * Recursively reset attestedEth for all nodes in tree
   */
  private static resetAttestedEth(node: BlockTreeNode): void {
    if (node.metadata) {
      node.metadata.attestedEth = 0;
    }
    for (const child of node.children) {
      LmdGhost.resetAttestedEth(child);
    }
  }
  
  /**
   * Handle attestation set changes
   * Called when new attestations arrive
   * Updates latest attestations and incrementally updates tree decorations
   */
  public static onAttestationSetChanged(
    beaconState: any,
    tree: BlockchainTree,
    allAttestations: Attestation[]
  ): void {
    // Update latest attestations for each validator
    // This will incrementally update tree decorations
    for (const attestation of allAttestations) {
      LmdGhost.recordAttestation(beaconState, tree, attestation);
    }
    
    // Note: GHOST-HEAD is computed on-demand via tree.getGhostHead()
    // No need to compute it here - it will be recomputed when needed
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
    return attestations.length * 32;
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

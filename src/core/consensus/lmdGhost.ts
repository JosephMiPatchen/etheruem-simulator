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
   * Incrementally update tree decorations for a newly added block
   * Only updates attestedEth if latest attestations point to this block
   * Walks from the new node up to root, adding attestedEth along the path
   */
  public static updateTreeDecorations(beaconState: any, tree: BlockchainTree, newBlockHash: string): void {
    // Check if any latest attestations point to this new block
    let attestationCount = 0;
    for (const attestation of beaconState.latestAttestations.values()) {
      if (attestation.blockHash === newBlockHash) {
        attestationCount++;
      }
    }
    
    // If no attestations point to this block, nothing to update
    if (attestationCount === 0) {
      return;
    }
    
    // Get the new block node
    const newNode = tree.getNode(newBlockHash);
    if (!newNode) {
      return;
    }
    
    // Calculate attestedEth to add (32 ETH per attestation)
    const attestedEthToAdd = attestationCount * 32;
    
    // Walk from new node up to root, adding attestedEth
    let current: BlockTreeNode | null = newNode;
    while (current) {
      if (!current.metadata) {
        current.metadata = {};
      }
      current.metadata.attestedEth = (current.metadata.attestedEth || 0) + attestedEthToAdd;
      current = current.parent;
    }
    
    console.log(`[LmdGhost] updateTreeDecorations: Added ${attestedEthToAdd} ETH (${attestationCount} attestations) to block ${newBlockHash.slice(0, 8)} and ancestors`);
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
   * DEBUG: Slow version that computes GHOST-HEAD without relying on cached attestedEth
   * Recursively walks tree and computes attestedEth on-the-fly for each node
   * Returns both the GHOST-HEAD hash and computed attestedEth values
   */
  public static computeGhostHeadSlow(beaconState: any, tree: BlockchainTree): string | null {
    const root = tree.getRoot();
    if (!root) return null;
    
    // Create attestation count map
    const blockAttestationCounts = new Map<string, number>();
    for (const attestation of beaconState.latestAttestations.values()) {
      const count = blockAttestationCounts.get(attestation.blockHash) || 0;
      blockAttestationCounts.set(attestation.blockHash, count + 1);
    }
    
    // Recursively compute GHOST-HEAD and attestedEth
    const result = LmdGhost.computeGhostHeadRecursive(root, blockAttestationCounts);
    return result.ghostHeadHash;
  }
  
  /**
   * Recursive helper for computeGhostHeadSlow
   * Returns: { attestedEth, ghostHeadHash }
   */
  private static computeGhostHeadRecursive(
    node: BlockTreeNode,
    blockAttestationCounts: Map<string, number>
  ): { attestedEth: number; ghostHeadHash: string } {
    // Invalid nodes have 0 attestedEth
    if (node.metadata?.isInvalid) {
      return { attestedEth: 0, ghostHeadHash: node.hash };
    }
    
    // Get direct attestations for this block
    const directAttestations = blockAttestationCounts.get(node.hash) || 0;
    const directAttestedEth = directAttestations * 32;
    
    // If no children, this is a leaf - return direct attestedEth and this node as head
    if (node.children.length === 0) {
      return { attestedEth: directAttestedEth, ghostHeadHash: node.hash };
    }
    
    // Recursively compute for all valid children
    const validChildren = node.children.filter(child => !child.metadata?.isInvalid);
    if (validChildren.length === 0) {
      // No valid children - this node is the head
      return { attestedEth: directAttestedEth, ghostHeadHash: node.hash };
    }
    
    // Compute attestedEth for each child and find heaviest
    let heaviestChild: { attestedEth: number; ghostHeadHash: string } | null = null;
    let maxChildAttestedEth = -1;
    
    for (const child of validChildren) {
      const childResult = LmdGhost.computeGhostHeadRecursive(child, blockAttestationCounts);
      
      if (childResult.attestedEth > maxChildAttestedEth) {
        maxChildAttestedEth = childResult.attestedEth;
        heaviestChild = childResult;
      }
    }
    
    // Total attestedEth = direct + heaviest child's subtree
    const totalAttestedEth = directAttestedEth + maxChildAttestedEth;
    
    // GHOST-HEAD is the head from the heaviest child's subtree
    return {
      attestedEth: totalAttestedEth,
      ghostHeadHash: heaviestChild!.ghostHeadHash
    };
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

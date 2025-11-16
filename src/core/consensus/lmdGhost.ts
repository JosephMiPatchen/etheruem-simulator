import { Block } from '../../types/types';
import { BlockchainTree, BlockTreeNode } from '../blockchain/blockchainTree';
import { BeaconState } from './beaconState';

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
  public static onLatestAttestChange(beaconState: any, tree: BlockchainTree, oldAtt: Attestation | undefined, newAtt: Attestation): void {
    // a) Decrement attestedEth for old attestation (if it points to a node in tree)
    if (oldAtt) {
      const oldNode = tree.getNode(oldAtt.blockHash);
      if (oldNode) {
        LmdGhost.decrementAttestedEthOfParents(oldNode);
      }
    }
    
    // b) Increment attestedEth for new attestation (if it points to a node in tree)
    const newNode = tree.getNode(newAtt.blockHash);
    if (newNode) {
      LmdGhost.incrementAttestedEthOfParents(newNode);
    }
  }
  
  /**
   * Increment attestedEth from a node up to root
   * Called when a new attestation points to this node
   * todo: attestedEthToAdd should come from validator set
   */
  private static incrementAttestedEthOfParents(node: BlockTreeNode,attestedEthToAdd: number = 32): void {
    let current: BlockTreeNode | null = node;
    
    while (current && !current.metadata.isInvalid) { // dont keep updating once we hit invalid node
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
   * todo: attestedEthToRemove should come from validator set
   */
  private static decrementAttestedEthOfParents(node: BlockTreeNode, attestedEthToRemove: number = 32): void {
    let current: BlockTreeNode | null = node;
    
    while (current && !current.metadata.isInvalid) { // dont keep updating once we hit invalid node
      if (current.metadata) {
        current.metadata.attestedEth = Math.max(0, (current.metadata.attestedEth || 0) - attestedEthToRemove);
      }
      current = current.parent;
    }
  }
    
  /**
   * Handle attestation set changes
   * Called when new attestations arrive
   * Updates latest attestations and incrementally updates tree decorations
   */
  public static onNewAttestations(
    beaconState: any,
    tree: BlockchainTree,
    allAttestations: Attestation[]
  ): void {

    for (const newAtt of allAttestations) {
      const existingAtt = beaconState.latestAttestations.get(newAtt.validatorAddress) as Attestation;
      if (!existingAtt || newAtt.timestamp > existingAtt.timestamp) {
        // if we have a newer one, update then update tree decorations
        beaconState.latestAttestations.set(newAtt.validatorAddress, newAtt); // update
        LmdGhost.onLatestAttestChange(beaconState, tree, existingAtt, newAtt);
      }
    }
  }

  public static onNewBlock(block: Block, tree: BlockchainTree, beaconState: BeaconState): void {
    const blockNode = tree.getNode(block.hash || '');
    if (!blockNode) return;
    
    for (const att of beaconState.latestAttestations.values()) {
      if (att.blockHash === block.hash) {
        LmdGhost.incrementAttestedEthOfParents(blockNode);
      }
    }
  }

  public static markNodeInvalid(node: BlockTreeNode): void {
    node.metadata.isInvalid = true;
    
    // Decrement parent's attestedEth by this node's attestedEth
    if (node.parent && node.metadata.attestedEth) {
      LmdGhost.decrementAttestedEthOfParents(node.parent, node.metadata.attestedEth);
    }
    
    node.metadata.attestedEth = 0;
    console.log(`[BlockchainTree] Marked node ${node.hash.slice(0, 8)} invalid`);
  }
  
  /**
   * Compute GHOST-HEAD using LMD-GHOST fork choice rule
   * Returns the block hash of the canonical chain head
   * 
   * Algorithm:
   * 1. Start at genesis (tree root)
   * 2. At each fork, choose the valid child with highest attestedEth
   * 3. Continue until a leaf or tie
   */
  public static computeGhostHead(tree: BlockchainTree): string | null {
    const root = tree.getRoot();
    if (!root) return null;
    let current = root;
    const isValid = (n: any) => !n.metadata?.isInvalid;
    const getAttestedEth = (n: any) => Number(n.metadata?.attestedEth ?? 0);
  
    while (current.children.length > 0) {
      // consider only valid children
      const validChildren = current.children.filter(isValid);
      if (validChildren.length === 0) break; // no valid children -> current is head
  
      // find the maximum attestedEth among valid children
      let maxEth = -Infinity;
      for (const child of validChildren) {
        const v = getAttestedEth(child);
        if (v > maxEth) maxEth = v;
      }
  
      // collect children that have that maximum value
      const heaviest = validChildren.filter(c => getAttestedEth(c) === maxEth);
  
      // if there's a tie (2 or more heaviest children), stop and return the parent (current)
      if (heaviest.length > 1) break;
  
      // otherwise exactly one heaviest child -> descend into it
      current = heaviest[0];
    }
  
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

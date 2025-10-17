import { NodeState } from '../../types/types';
import { calculateBlockHeaderHash } from '../../core/validation/blockValidator';

export class ForkDetectionService {
  /**
   * Detect forks by comparing blocks at each height across all nodes
   * @param nodeStates The current state of all nodes in the network
   * @returns The height at which the fork begins, or null if no fork exists
   */
  public static detectForks(nodeStates: Record<string, NodeState>): number | null {
    // Group blocks by height across all nodes
    const blocksByHeight: Record<number, Set<string>> = {};
    
    // Collect all blocks from all nodes, grouped by height
    Object.values(nodeStates).forEach(nodeState => {
      nodeState.blockchain.forEach(block => {
        const height = block.header.height;
        const blockHash = calculateBlockHeaderHash(block.header);
        
        if (!blocksByHeight[height]) {
          blocksByHeight[height] = new Set();
        }
        blocksByHeight[height].add(blockHash);
      });
    });
    
    // Find the first height where there are multiple different blocks
    const heights = Object.keys(blocksByHeight).map(Number).sort((a, b) => a - b);
    for (const height of heights) {
      if (blocksByHeight[height].size > 1) {
        return height;
      }
    }
    
    return null;
  }
}

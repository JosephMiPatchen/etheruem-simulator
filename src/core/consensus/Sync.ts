import { Block } from '../../types/types';
import { Blockchain } from '../blockchain/blockchain';
import { BeaconState } from './beaconState';

/**
 * Sync class handles LMD-GHOST head synchronization for PoS
 * Each node has its own Sync instance
 * 
 * Three-Message Sync Algorithm:
 * 1. LMD_GHOST_BROADCAST: Periodically broadcast GHOST-HEAD to all nodes
 * 2. CHAIN_REQUEST: If received head doesn't exist, request chain (direct message)
 * 3. CHAIN_RESPONSE: Respond with chain from requested head to genesis (direct message)
 */
export class Sync {
  private blockchain: Blockchain;
  private beaconState: BeaconState;
  private nodeId: string;
  
  // Callback for sending messages to network
  private onSendMessage?: (message: any) => void;
  
  constructor(blockchain: Blockchain, beaconState: BeaconState, nodeId: string) {
    this.blockchain = blockchain;
    this.beaconState = beaconState;
    this.nodeId = nodeId;
  }
  
  /**
   * Sets the callback for sending messages to the network
   */
  setMessageCallback(callback: (message: any) => void): void {
    this.onSendMessage = callback;
  }
  
  /**
   * Gets the current LMD-GHOST head hash
   * Returns genesis block hash if no attestations (no GHOST-HEAD computed)
   */
  getGhostHeadHash(): string {
    const ghostHead = this.beaconState.ghostHead;
    
    // If no GHOST-HEAD (no attestations), default to genesis block
    if (!ghostHead) {
      const genesisBlock = this.blockchain.getBlockByHeight(0);
      return genesisBlock?.hash || '';
    }
    
    return ghostHead;
  }
  
  /**
   * Broadcasts the current LMD-GHOST head to all peers
   * Called periodically (every second)
   * Message Type: LMD_GHOST_BROADCAST (broadcast to all)
   */
  broadcastGhostHead(): void {
    if (!this.onSendMessage) return;
    
    const ghostHeadHash = this.getGhostHeadHash();
    
    const message = {
      type: 'LMD_GHOST_BROADCAST',
      fromNodeId: this.nodeId,
      ghostHeadHash
    };
    
    this.onSendMessage(message);
  }
  
  /**
   * Handles receiving an LMD-GHOST broadcast from another node
   * Checks if the head exists in local tree
   * If not, sends a CHAIN_REQUEST to that node
   * 
   * Message Type: LMD_GHOST_BROADCAST (received)
   * May send: CHAIN_REQUEST (direct to sender)
   */
  handleGhostBroadcast(fromNodeId: string, ghostHeadHash: string): void {
    // Check if this head exists in our tree
    const tree = this.blockchain.getTree();
    const headNode = tree.getNode(ghostHeadHash);
    
    // If we don't have this head, request the chain
    if (!headNode) {
      this.requestChain(fromNodeId, ghostHeadHash);
    }
    // If we have it, no action needed - we're in sync
  }
  
  /**
   * Sends a chain request to a specific node
   * Requests the chain for a specific head hash
   * 
   * Message Type: CHAIN_REQUEST (direct message)
   */
  private requestChain(toNodeId: string, requestedHeadHash: string): void {
    if (!this.onSendMessage) return;
    
    const message = {
      type: 'CHAIN_REQUEST',
      fromNodeId: this.nodeId,
      toNodeId,
      requestedHeadHash
    };
    
    this.onSendMessage(message);
  }
  
  /**
   * Handles receiving a chain request from another node
   * Returns the chain from the requested head to genesis
   * IMPORTANT: Returns the chain for THAT specific head, not our current GHOST-HEAD
   * (Our GHOST-HEAD may have changed since the request was made)
   * 
   * Message Type: CHAIN_REQUEST (received)
   * Sends: CHAIN_RESPONSE (direct to requester)
   */
  handleChainRequest(fromNodeId: string, requestedHeadHash: string): void {
    if (!this.onSendMessage) return;
    
    // Get the chain from the requested head to genesis
    // NOT our current GHOST-HEAD chain (it may have changed)
    const tree = this.blockchain.getTree();
    const chain = tree.getCanonicalChain(requestedHeadHash);
    
    // If we don't have this head, we can't respond
    if (chain.length === 0) {
      console.warn(`[Sync] Cannot respond to chain request for unknown head: ${requestedHeadHash.slice(0, 8)}`);
      return;
    }
    
    const message = {
      type: 'CHAIN_RESPONSE',
      fromNodeId: this.nodeId,
      toNodeId: fromNodeId,
      requestedHeadHash,
      blocks: chain
    };
    
    this.onSendMessage(message);
  }
  
  /**
   * Handles receiving a chain response from another node
   * Processes the received chain and updates local blockchain
   * 
   * Message Type: CHAIN_RESPONSE (received)
   */
  async handleChainResponse(requestedHeadHash: string, blocks: Block[]): Promise<void> {
    if (blocks.length === 0) {
      console.warn(`[Sync] Received empty chain response for head: ${requestedHeadHash.slice(0, 8)}`);
      return;
    }
    
    console.log(`[Sync] Received chain with ${blocks.length} blocks for head: ${requestedHeadHash.slice(0, 8)}`);
    
    // Try to add the received chain to our blockchain
    // This will trigger chain replacement if the new chain is valid
    const replaced = await this.blockchain.replaceChain(blocks);
    
    if (replaced) {
      console.log(`[Sync] Successfully synced chain for head: ${requestedHeadHash.slice(0, 8)}`);
    } else {
      console.log(`[Sync] Chain not replaced (may be shorter or invalid): ${requestedHeadHash.slice(0, 8)}`);
    }
  }
}

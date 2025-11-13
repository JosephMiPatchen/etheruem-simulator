import { Block } from '../../types/types';
import { Blockchain } from '../blockchain/blockchain';
import { MessageType } from '../../network/messages';
import { SimulatorConfig } from '../../config/config';

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
  private nodeId: string;
  
  // Callback for sending messages to network
  private onSendMessage?: (message: any) => void;
  
  constructor(blockchain: Blockchain, nodeId: string) {
    this.blockchain = blockchain;
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
   * Returns genesis hash if no GHOST-HEAD
   */
  private getGhostHeadHash(): string {
    const tree = this.blockchain.getTree();
    const ghostHeadNode = tree.getGhostHead();
    
    // If no GHOST-HEAD, return genesis
    if (!ghostHeadNode) {
      const genesisBlock = this.blockchain.getBlockByHeight(0);
      return genesisBlock?.hash || '';
    }
    
    return ghostHeadNode.hash;
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
      type: MessageType.LMD_GHOST_BROADCAST,
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
      type: MessageType.CHAIN_REQUEST,
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
    const tree = this.blockchain.getTree();
    const chain = tree.getChain(requestedHeadHash);
    
    // If we don't have this head, we can't respond
    if (chain.length === 0) {
      console.warn(`[Sync] Cannot respond to chain request for unknown head: ${requestedHeadHash.slice(0, 8)}`);
      return;
    }
    
    const message = {
      type: MessageType.CHAIN_RESPONSE,
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
      if (SimulatorConfig.DEBUG_SYNC) {
        console.warn(`[Sync] Received empty chain response for head: ${requestedHeadHash.slice(0, 8)}`);
      }
      return;
    }
    
    if (SimulatorConfig.DEBUG_SYNC) {
      console.log(`[Sync] Received chain with ${blocks.length} blocks for head: ${requestedHeadHash.slice(0, 8)}`);
    }
    
    // Try to add the received chain to our blocktree
    await this.blockchain.addChain(blocks);
  }
}

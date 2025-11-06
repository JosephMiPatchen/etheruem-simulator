import { Node } from '../core/node';
import { Block, PeerInfoMap, Attestation } from '../types/types';
import { Validator } from '../core/consensus/beaconState';
import { 
  Message, 
  MessageType, 
  BlockAnnouncementMessage,
  ChainRequestMessage,
  ChainResponseMessage,
  HeightRequestMessage,
  HeightResponseMessage,
  AttestationMessage
} from './messages';
import { createSignedTransaction } from '../core/blockchain/transaction';

/**
 * NodeWorker class that wraps a Node instance and handles message passing
 * This simulates a node running in its own process/thread
 */
export class NodeWorker {
  private _node: Node;
  private onOutgoingMessageCallback?: (message: Message) => void;
  
  /**
   * Gets the underlying Node instance
   * @returns The Node instance
   */
  get node(): Node {
    return this._node;
  }
  
  constructor(nodeId: string, genesisTime?: number, validators?: Validator[]) {
    // Create the node instance with beacon state initialization
    this._node = new Node(nodeId, genesisTime, validators);
    
    // Set up callback for block broadcast events
    this._node.setOnBlockBroadcast(this.handleBlockBroadcast.bind(this));
  }
  
  /**
   * Sets the callback for when this node needs to send a message to other nodes
   * This is called by the NetworkManager to establish the outgoing message channel
   */
  setOnOutgoingMessage(callback: (message: Message) => void): void {
    this.onOutgoingMessageCallback = callback;
  }
  
  /**
   * Receives and processes incoming messages from other nodes via the network
   */
  receiveIncomingMessage(message: Message): void {
    switch (message.type) {
      case MessageType.BLOCK_ANNOUNCEMENT:
        this.handleBlockAnnouncement(message as BlockAnnouncementMessage);
        break;
      case MessageType.CHAIN_REQUEST:
        this.handleChainRequest(message as ChainRequestMessage);
        break;
      case MessageType.CHAIN_RESPONSE:
        this.handleChainResponse(message as ChainResponseMessage);
        break;
      case MessageType.HEIGHT_REQUEST:
        this.handleHeightRequest(message as HeightRequestMessage);
        break;
      case MessageType.HEIGHT_RESPONSE:
        this.handleHeightResponse(message as HeightResponseMessage);
        break;
      case MessageType.ATTESTATION:
        this.handleAttestation(message as AttestationMessage);
        break;
      default:
        console.error(`Unknown message type: ${(message as any).type}`);
    }
  }
  
  /**
   * Sets the peer information with addresses directly
   * @param peers Object mapping peer IDs to their information including addresses
   */
  setPeerInfosWithAddresses(peers: PeerInfoMap): void {
    this._node.setPeerInfosWithAddresses(peers);
  }
  
  /**
   * Gets the Bitcoin address of this node
   */
  getNodeAddress(): string {
    return this._node.getAddress();
  }
  

  
  /**
   * Starts mining on this node
   */
  startMining(): void {
    this._node.startMining();
  }
  
  /**
   * Stops mining on this node
   */
  stopMining(): void {
    this._node.stopMining();
  }
  
  /**
   * Gets the current state of the node
   */
  getState(): any {
    return this._node.getState();
  }
  
  /**
   * Handles a block broadcast event from the node
   * Creates a network message and sends it to peers via the network layer
   */
  private handleBlockBroadcast(block: Block): void {
    if (!this.onOutgoingMessageCallback) return;
    
    // Create a block announcement message
    const message: BlockAnnouncementMessage = {
      type: MessageType.BLOCK_ANNOUNCEMENT,
      fromNodeId: this._node.getState().nodeId,
      block
    };
    
    // Send the message to the network for routing
    this.onOutgoingMessageCallback(message);
  }
  

  
  /**
   * Handles a block announcement message from another node
   * After receiving and validating the block, creates an attestation
   */
  private handleBlockAnnouncement(message: BlockAnnouncementMessage): void {
    // Process the received block
    this._node.receiveBlock(message.block);
    
    // Create and broadcast attestation for this block (PoS consensus)
    this.createAndBroadcastAttestation(message.block);
  }
  
  /**
   * Creates and broadcasts an attestation for a received block
   * This is part of the PoS consensus mechanism
   */
  private createAndBroadcastAttestation(block: Block): void {
    if (!this.onOutgoingMessageCallback) return;
    
    const nodeState = this._node.getState();
    if (!nodeState.address) return; // Skip if no address
    
    // Skip if block doesn't have a hash
    if (!block.hash) {
      console.warn('Cannot create attestation for block without hash');
      return;
    }
    
    // Create attestation (address is guaranteed to exist after check above)
    const attestation: Attestation = {
      validatorAddress: nodeState.address!,
      blockHash: block.hash,
      timestamp: Date.now()
    };
    
    // Add to our own beacon pool
    if (nodeState.beaconState) {
      nodeState.beaconState.addAttestation(attestation);
    }
    
    // Broadcast attestation to network
    const message: AttestationMessage = {
      type: MessageType.ATTESTATION,
      fromNodeId: nodeState.nodeId,
      attestation
    };
    
    this.onOutgoingMessageCallback(message);
  }
  
  /**
   * Handles a chain request message from another node
   * Responds with this node's blockchain
   */
  private handleChainRequest(message: ChainRequestMessage): void {
    if (!this.onOutgoingMessageCallback) return;
    
    // Get all blocks in the chain
    const blocks = this._node.getBlocks();
    
    // Create a chain response message
    const response: ChainResponseMessage = {
      type: MessageType.CHAIN_RESPONSE,
      fromNodeId: this._node.getState().nodeId,
      toNodeId: message.fromNodeId,
      blocks
    };
    
    // Send the response to the network for routing
    this.onOutgoingMessageCallback(response);
  }
  
  /**
   * Handles a chain response message from another node
   */
  private handleChainResponse(message: ChainResponseMessage): void {
    // Process the received chain
    if (message.blocks.length > 0) {
      this._node.receiveChain(message.blocks);
    }
  }
  
  /**
   * Handles a height request message from another node
   * Responds with this node's current blockchain height
   */
  private handleHeightRequest(message: HeightRequestMessage): void {
    if (!this.onOutgoingMessageCallback) return;
    
    // Get our current blockchain height
    const ourHeight = this._node.getBlockchainHeight();
    
    // Create a height response message
    const response: HeightResponseMessage = {
      type: MessageType.HEIGHT_RESPONSE,
      fromNodeId: this._node.getState().nodeId,
      toNodeId: message.fromNodeId,
      height: ourHeight
    };
    
    // Send the response to the network for routing
    this.onOutgoingMessageCallback(response);
  }
  
  /**
   * Handles a height response message from another node
   */
  private handleHeightResponse(message: HeightResponseMessage): void {
    // Get our current blockchain height
    const ourHeight = this._node.getBlockchainHeight();
    
    // Always request longer chains to stay in sync
    if (message.height > ourHeight) {
      this.requestChain(message.fromNodeId);
    }
  }
  
  /**
   * Handles an attestation message from another validator
   * Adds the attestation to the local beacon pool
   */
  private handleAttestation(message: AttestationMessage): void {
    // Add attestation to beacon state's beacon pool
    const beaconState = this._node.getState().beaconState;
    if (beaconState) {
      beaconState.addAttestation(message.attestation);
    }
  }
  
  /**
   * Requests the blockchain from a specific node
   */
  requestChain(fromNodeId: string): void {
    if (!this.onOutgoingMessageCallback) return;
    
    // Create a chain request message
    const message: ChainRequestMessage = {
      type: MessageType.CHAIN_REQUEST,
      fromNodeId: this._node.getState().nodeId,
      toNodeId: fromNodeId
    };
    
    // Send the message to the network for routing
    this.onOutgoingMessageCallback(message);
  }
  
  /**
   * Requests the blockchain height from a specific node
   */
  requestHeight(nodeId: string): void {
    if (!this.onOutgoingMessageCallback) return;
    
    // Create a height request message
    const message: HeightRequestMessage = {
      type: MessageType.HEIGHT_REQUEST,
      fromNodeId: this._node.getState().nodeId,
      toNodeId: nodeId
    };
    
    // Send the message to the network for routing
    this.onOutgoingMessageCallback(message);
  }
  
  /**
   * Requests the blockchain height from all peers
   */
  requestHeightFromPeers(): void {
    // Get peer IDs from the peer information map
    const peerIds = Object.keys(this._node.getPeerInfos());
    
    // Request height from each peer
    for (const peerId of peerIds) {
      this.requestHeight(peerId);
    }
  }
  
  /**
   * Creates and adds a transaction to this node's mempool
   * @param recipient Recipient address
   * @param amount Amount in ETH
   * @returns true if transaction was added successfully
   */
  async addTransactionToMempool(recipient: string, amount: number): Promise<boolean> {
    // Get current nonce from world state
    const worldState = this._node.getWorldState();
    const senderAddress = this._node.getAddress();
    const senderAccount = worldState[senderAddress];
    const baseNonce = senderAccount ? senderAccount.nonce : 0;
    
    // Count pending transactions from this sender in mempool to calculate next nonce
    const mempoolTransactions = this._node.getMempoolTransactions(1000); // Get all mempool transactions
    const pendingFromSender = mempoolTransactions.filter(tx => tx.from === senderAddress).length;
    const nonce = baseNonce + pendingFromSender;
    
    console.log(`Creating transaction with nonce ${nonce} (base: ${baseNonce}, pending: ${pendingFromSender})`);
    
    // Create a signed transaction
    const transaction = await createSignedTransaction(
      senderAddress,
      recipient,
      amount,
      nonce,
      this._node.getPrivateKey(),
      this._node.getPublicKey()
    );
    
    // Add to mempool
    return this._node.addTransactionToMempool(transaction);
  }
}

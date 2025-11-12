import { Node } from '../core/node';
import { Block, PeerInfoMap, Attestation } from '../types/types';
import { Validator } from '../core/consensus/beaconState';
import { 
  Message, 
  MessageType, 
  AttestationMessage,
  LmdGhostBroadcastMessage,
  ChainRequestMessage,
  ChainResponseMessage,
  ProposerBlockBroadcastMessage
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
    
    // Set up callback for Sync to send messages
    this._node.getSync().setMessageCallback((message: any) => {
      if (this.onOutgoingMessageCallback) {
        this.onOutgoingMessageCallback(message as Message);
      }
    });
    
    // Set up callback for Consensus to send messages
    this._node.getConsensus().setMessageCallback((message: any) => {
      if (this.onOutgoingMessageCallback) {
        this.onOutgoingMessageCallback(message as Message);
      }
    });
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
      case MessageType.ATTESTATION:
        this.handleAttestation(message as AttestationMessage);
        break;
      case MessageType.LMD_GHOST_BROADCAST:
        this.handleLmdGhostBroadcast(message as LmdGhostBroadcastMessage);
        break;
      case MessageType.CHAIN_REQUEST:
        this.handleChainRequest(message as ChainRequestMessage);
        break;
      case MessageType.CHAIN_RESPONSE:
        this.handleChainResponse(message as ChainResponseMessage);
        break;
      case MessageType.PROPOSER_BLOCK_BROADCAST:
        this.handleProposerBlockBroadcast(message as ProposerBlockBroadcastMessage);
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
   * Handles LMD-GHOST broadcast message
   * Thin wrapper - delegates to Sync class
   */
  private handleLmdGhostBroadcast(message: LmdGhostBroadcastMessage): void {
    const sync = this._node.getSync();
    sync.handleGhostBroadcast(message.fromNodeId, message.ghostHeadHash);
  }
  
  /**
   * Handles chain request message
   * Thin wrapper - delegates to Sync class
   */
  private handleChainRequest(message: ChainRequestMessage): void {
    const sync = this._node.getSync();
    sync.handleChainRequest(message.fromNodeId, message.requestedHeadHash);
  }
  
  /**
   * Handles chain response message
   * Thin wrapper - delegates to Sync class
   */
  private handleChainResponse(message: ChainResponseMessage): void {
    const sync = this._node.getSync();
    sync.handleChainResponse(message.requestedHeadHash, message.blocks);
  }
  
  /**
   * Handles proposer block broadcast message
   * Thin wrapper - delegates to Consensus class
   */
  private handleProposerBlockBroadcast(message: ProposerBlockBroadcastMessage): void {
    const consensus = this._node.getConsensus();
    consensus.handleProposedBlock(message.block, message.slot, message.fromNodeId);
  }
  
  /**
   * Broadcasts LMD-GHOST head
   * Called periodically to sync with other nodes
   */
  broadcastGhostHead(): void {
    const sync = this._node.getSync();
    sync.broadcastGhostHead();
  }
  
  /**
   * Processes a consensus slot
   * Called periodically (every 12 seconds) to run PoS consensus
   */
  async processSlot(): Promise<void> {
    const consensus = this._node.getConsensus();
    await consensus.processSlot();
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

import { Block, Attestation } from '../types/types';

/**
 * Types of messages that can be sent between nodes
 * PoS uses attestations, LMD-GHOST head synchronization, and proposer block broadcasts
 */
export enum MessageType {
  ATTESTATION = 'ATTESTATION',
  LMD_GHOST_BROADCAST = 'LMD_GHOST_BROADCAST',
  CHAIN_REQUEST = 'CHAIN_REQUEST',
  CHAIN_RESPONSE = 'CHAIN_RESPONSE',
  PROPOSER_BLOCK_BROADCAST = 'PROPOSER_BLOCK_BROADCAST',
}

/**
 * Base interface for all network messages
 */
export interface NetworkMessage {
  type: MessageType;
  fromNodeId: string;
  toNodeId?: string; // Optional for broadcast messages
}

/**
 * Message for broadcasting an attestation (PoS consensus)
 */
export interface AttestationMessage extends NetworkMessage {
  type: MessageType.ATTESTATION;
  attestation: Attestation;
}

/**
 * Message for broadcasting LMD-GHOST head for synchronization
 * Nodes periodically broadcast their current GHOST-HEAD to all peers
 */
export interface LmdGhostBroadcastMessage extends NetworkMessage {
  type: MessageType.LMD_GHOST_BROADCAST;
  ghostHeadHash: string; // Hash of the node's current LMD-GHOST head
}

/**
 * Message for requesting a chain for a specific head
 * Sent when a node receives a GHOST head it doesn't have
 */
export interface ChainRequestMessage extends NetworkMessage {
  type: MessageType.CHAIN_REQUEST;
  toNodeId: string; // Required for direct request
  requestedHeadHash: string; // The head hash to get the chain for
}

/**
 * Message for responding with a chain branch
 * Returns the chain from the requested head to genesis
 */
export interface ChainResponseMessage extends NetworkMessage {
  type: MessageType.CHAIN_RESPONSE;
  toNodeId: string; // Required for direct response
  requestedHeadHash: string; // The head that was requested
  blocks: Block[]; // Chain from requested head to genesis
}

/**
 * Message for broadcasting a proposed block from the slot proposer
 * Sent to all validators (not all peers) for attestation
 */
export interface ProposerBlockBroadcastMessage extends NetworkMessage {
  type: MessageType.PROPOSER_BLOCK_BROADCAST;
  block: Block; // The proposed block with slot number
  slot: number; // The slot this block was proposed in
}

/**
 * Union type for all network messages (PoS only)
 */
export type Message = 
  | AttestationMessage
  | LmdGhostBroadcastMessage
  | ChainRequestMessage
  | ChainResponseMessage
  | ProposerBlockBroadcastMessage;

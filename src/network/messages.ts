import { Block, Attestation } from '../types/types';

/**
 * Types of messages that can be sent between nodes
 * PoS uses only block announcements and attestations
 */
export enum MessageType {
  BLOCK_ANNOUNCEMENT = 'BLOCK_ANNOUNCEMENT',
  ATTESTATION = 'ATTESTATION',
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
 * Message for announcing a new block
 */
export interface BlockAnnouncementMessage extends NetworkMessage {
  type: MessageType.BLOCK_ANNOUNCEMENT;
  block: Block;
}

/**
 * Message for broadcasting an attestation (PoS consensus)
 */
export interface AttestationMessage extends NetworkMessage {
  type: MessageType.ATTESTATION;
  attestation: Attestation;
}

/**
 * Union type for all network messages (PoS only)
 */
export type Message = 
  | BlockAnnouncementMessage
  | AttestationMessage;

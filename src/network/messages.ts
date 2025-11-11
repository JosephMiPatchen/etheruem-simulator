import { Attestation } from '../types/types';

/**
 * Types of messages that can be sent between nodes
 * PoS uses attestations (block proposals will be added later)
 */
export enum MessageType {
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
 * Message for broadcasting an attestation (PoS consensus)
 */
export interface AttestationMessage extends NetworkMessage {
  type: MessageType.ATTESTATION;
  attestation: Attestation;
}

/**
 * Union type for all network messages (PoS only)
 */
export type Message = AttestationMessage;

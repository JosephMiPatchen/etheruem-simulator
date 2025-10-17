import { Block } from '../types/types';

/**
 * Types of messages that can be sent between nodes
 */
export enum MessageType {
  BLOCK_ANNOUNCEMENT = 'BLOCK_ANNOUNCEMENT',
  CHAIN_REQUEST = 'CHAIN_REQUEST',
  CHAIN_RESPONSE = 'CHAIN_RESPONSE',
  HEIGHT_REQUEST = 'HEIGHT_REQUEST',
  HEIGHT_RESPONSE = 'HEIGHT_RESPONSE',
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
 * Message for requesting the chain from a node
 */
export interface ChainRequestMessage extends NetworkMessage {
  type: MessageType.CHAIN_REQUEST;
  toNodeId: string; // Required for direct messages
}

/**
 * Message for responding to a chain request
 */
export interface ChainResponseMessage extends NetworkMessage {
  type: MessageType.CHAIN_RESPONSE;
  toNodeId: string; // Required for direct messages
  blocks: Block[];
}

/**
 * Message for requesting the current blockchain height
 */
export interface HeightRequestMessage extends NetworkMessage {
  type: MessageType.HEIGHT_REQUEST;
  toNodeId: string; // Required for direct messages
}

/**
 * Message for responding to a height request
 */
export interface HeightResponseMessage extends NetworkMessage {
  type: MessageType.HEIGHT_RESPONSE;
  toNodeId: string; // Required for direct messages
  height: number;
}

/**
 * Union type for all network messages
 */
export type Message = 
  | BlockAnnouncementMessage
  | ChainRequestMessage
  | ChainResponseMessage
  | HeightRequestMessage
  | HeightResponseMessage;

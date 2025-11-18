/**
 * Unit tests for CasperFFG class
 * Tests checkpoint computation for Casper FFG finality
 */

import { CasperFFG } from '../../core/consensus/casperFFG';
import { Block } from '../../types/types';
import { SimulatorConfig } from '../../config/config';

describe('CasperFFG', () => {
  
  /**
   * Helper to create a test block
   */
  function createBlock(hash: string, slot: number, height: number): Block {
    return {
      hash,
      header: {
        transactionHash: '',
        timestamp: Date.now(),
        previousHeaderHash: '',
        height,
        slot,
      },
      transactions: [],
      attestations: [],
      randaoReveal: 'test-randao',
    };
  }
  
  describe('computeCheckpoints', () => {
    it('should compute checkpoints for slot in middle of epoch', () => {
      // Given: SLOTS_PER_EPOCH = 4, current slot = 6 (epoch 1)
      // Target epoch = 1 (checkpoint slot 4), Source = justified checkpoint
      const canonicalChain = [
        createBlock('genesis', -1, 0),
        createBlock('block1', 0, 1),
        createBlock('block2', 2, 2),
        createBlock('block3', 4, 3),
        createBlock('block4', 6, 4),
      ];
      
      const mockBeaconState = {
        justifiedCheckpoint: { epoch: 0, root: 'block1' }
      };
      
      // When: Compute checkpoints for slot 6
      const checkpoints = CasperFFG.computeCheckpoints(6, canonicalChain, mockBeaconState);
      
      // Then: Source = justified checkpoint, Target = epoch 1 (block at slot 4)
      expect(checkpoints.source.epoch).toBe(0);
      expect(checkpoints.source.root).toBe('block1'); // Justified checkpoint
      expect(checkpoints.target.epoch).toBe(1);
      expect(checkpoints.target.root).toBe('block3'); // Slot 4
    });
    
    it('should handle empty checkpoint slots by using previous block', () => {
      // Given: Checkpoint slot 4 is empty, use block at slot 3
      const canonicalChain = [
        createBlock('genesis', -1, 0),
        createBlock('block1', 0, 1),
        createBlock('block2', 3, 2), // Slot 3 (before checkpoint 4)
        createBlock('block3', 6, 3),
      ];
      
      const mockBeaconState = {
        justifiedCheckpoint: { epoch: 0, root: 'block1' }
      };
      
      // When: Compute checkpoints for slot 6 (epoch 1, checkpoint slot 4)
      const checkpoints = CasperFFG.computeCheckpoints(6, canonicalChain, mockBeaconState);
      
      // Then: Target should use block at slot 3 (closest before checkpoint 4)
      expect(checkpoints.target.epoch).toBe(1);
      expect(checkpoints.target.root).toBe('block2'); // Slot 3 < checkpoint 4
    });
    
    it('should handle epoch 0 with source = epoch 0', () => {
      // Given: Current slot = 2 (epoch 0)
      const canonicalChain = [
        createBlock('genesis', -1, 0),
        createBlock('block1', 0, 1),
        createBlock('block2', 2, 2),
      ];
      
      const mockBeaconState = {
        justifiedCheckpoint: { epoch: -1, root: null }
      };
      
      // When: Compute checkpoints for slot 2
      const checkpoints = CasperFFG.computeCheckpoints(2, canonicalChain, mockBeaconState);
      
      // Then: Both source and target should be epoch 0
      expect(checkpoints.source.epoch).toBe(0);
      expect(checkpoints.target.epoch).toBe(0);
      expect(checkpoints.source.root).toBe('block1'); // Slot 0
      expect(checkpoints.target.root).toBe('block1'); // Slot 0
    });
    
    it('should handle first slot of epoch', () => {
      // Given: Current slot = 4 (first slot of epoch 1)
      const canonicalChain = [
        createBlock('genesis', -1, 0),
        createBlock('block1', 0, 1),
        createBlock('block2', 4, 2), // Exactly at checkpoint
      ];
      
      const mockBeaconState = {
        justifiedCheckpoint: { epoch: 1, root: 'block3' }
      };
      
      // When: Compute checkpoints for slot 8 (epoch 2)
      const checkpoints = CasperFFG.computeCheckpoints(8, canonicalChain, mockBeaconState);
      
      // Then: Target should use block at exact checkpoint slot
      expect(checkpoints.target.epoch).toBe(1);
      expect(checkpoints.target.root).toBe('block2'); // Exact match at slot 4
    });
    
    it('should handle sparse chain with large gaps', () => {
      // Given: Large gaps between blocks
      const canonicalChain = [
        createBlock('genesis', -1, 0),
        createBlock('block1', 1, 1),
        createBlock('block2', 10, 2), // Big gap
      ];
      
      const mockBeaconState = {
        justifiedCheckpoint: { epoch: -1, root: null }
      };
      
      // When: Compute checkpoints for slot 0 (first slot of epoch 0)
      const checkpoints = CasperFFG.computeCheckpoints(0, canonicalChain, mockBeaconState);
      
      // Then: Should use block1 for target (closest before checkpoint 8)
      expect(checkpoints.target.epoch).toBe(2);
      expect(checkpoints.target.root).toBe('block1'); // Slot 1 < checkpoint 8
    });
  });
  
  describe('getCheckpointSlot', () => {
    it('should calculate checkpoint slot for epoch', () => {
      // SLOTS_PER_EPOCH = 4
      expect(CasperFFG.getCheckpointSlot(0)).toBe(0);
      expect(CasperFFG.getCheckpointSlot(1)).toBe(4);
      expect(CasperFFG.getCheckpointSlot(2)).toBe(8);
      expect(CasperFFG.getCheckpointSlot(10)).toBe(40);
    });
  });
  
  describe('getEpoch', () => {
    it('should calculate epoch from slot', () => {
      // SLOTS_PER_EPOCH = 4
      expect(CasperFFG.getEpoch(0)).toBe(0);
      expect(CasperFFG.getEpoch(3)).toBe(0);
      expect(CasperFFG.getEpoch(4)).toBe(1);
      expect(CasperFFG.getEpoch(7)).toBe(1);
      expect(CasperFFG.getEpoch(8)).toBe(2);
      expect(CasperFFG.getEpoch(15)).toBe(3);
    });
  });
});

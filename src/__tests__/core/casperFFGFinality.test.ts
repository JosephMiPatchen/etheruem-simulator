/**
 * Unit tests for Casper FFG Finality Tracking
 * Tests justification and finalization logic
 */

import { CasperFFG } from '../../core/consensus/casperFFG';

describe('CasperFFG Finality Tracking', () => {
  
  /**
   * Helper to create a mock BeaconState
   */
  function createMockBeaconState(validatorCount: number) {
    const validators = Array.from({ length: validatorCount }, (_, i) => ({
      nodeAddress: `validator${i}`,
      stakedEth: 32
    }));
    
    return {
      validators,
      justifiedCheckpoint: { epoch: -1, root: null },
      previousJustifiedCheckpoint: null,
      finalizedCheckpoint: null,
      ffgVoteCounts: {},
      latestAttestationByValidator: {}
    };
  }
  
  /**
   * Helper to create an attestation
   */
  function createAttestation(
    validatorAddress: string,
    blockHash: string,
    sourceEpoch: number,
    sourceRoot: string | null,
    targetEpoch: number,
    targetRoot: string
  ) {
    return {
      validatorAddress,
      blockHash,
      timestamp: Date.now(),
      ffgSource: { epoch: sourceEpoch, root: sourceRoot },
      ffgTarget: { epoch: targetEpoch, root: targetRoot }
    };
  }
  
  describe('applyAttestationsToBeaconState', () => {
    
    it('should not justify epoch with insufficient votes (< 2/3)', () => {
      // Given: 4 validators, threshold = 3 (ceil(2*4/3))
      const beaconState = createMockBeaconState(4);
      
      // When: Only 2 validators attest (< 2/3)
      const attestations = [
        createAttestation('validator0', 'block1', -1, null, 0, 'block1'),
        createAttestation('validator1', 'block1', -1, null, 0, 'block1')
      ];
      
      CasperFFG.applyAttestationsToBeaconState(beaconState, attestations);
      
      // Then: Epoch 0 should NOT be justified (only 2/3 votes)
      expect(beaconState.justifiedCheckpoint.epoch).toBe(-1);
      expect(beaconState.previousJustifiedCheckpoint).toBeNull();
      expect(beaconState.finalizedCheckpoint).toBeNull();
    });
    
    it('should justify epoch with exactly 2/3 votes', () => {
      // Given: 4 validators, threshold = 3
      const beaconState = createMockBeaconState(4);
      
      // When: Exactly 3 validators attest (2/3)
      const attestations = [
        createAttestation('validator0', 'block1', -1, null, 0, 'block1'),
        createAttestation('validator1', 'block1', -1, null, 0, 'block1'),
        createAttestation('validator2', 'block1', -1, null, 0, 'block1')
      ];
      
      CasperFFG.applyAttestationsToBeaconState(beaconState, attestations);
      
      // Then: Epoch 0 should be justified, and epoch -1 finalized (consecutive)
      expect(beaconState.justifiedCheckpoint.epoch).toBe(0);
      expect(beaconState.justifiedCheckpoint.root).toBe('block1');
      expect(beaconState.previousJustifiedCheckpoint?.epoch).toBe(-1);
      expect(beaconState.finalizedCheckpoint?.epoch).toBe(-1); // Finalized! (epochs -1 and 0 are consecutive)
    });
    
    it('should justify epoch with more than 2/3 votes', () => {
      // Given: 4 validators, threshold = 3
      const beaconState = createMockBeaconState(4);
      
      // When: All 4 validators attest (> 2/3)
      const attestations = [
        createAttestation('validator0', 'block1', -1, null, 0, 'block1'),
        createAttestation('validator1', 'block1', -1, null, 0, 'block1'),
        createAttestation('validator2', 'block1', -1, null, 0, 'block1'),
        createAttestation('validator3', 'block1', -1, null, 0, 'block1')
      ];
      
      CasperFFG.applyAttestationsToBeaconState(beaconState, attestations);
      
      // Then: Epoch 0 should be justified
      expect(beaconState.justifiedCheckpoint.epoch).toBe(0);
      expect(beaconState.justifiedCheckpoint.root).toBe('block1');
    });
    
    it('should finalize epoch when consecutive epochs are justified', () => {
      // Given: 4 validators, epoch 0 already justified
      const beaconState = createMockBeaconState(4);
      beaconState.justifiedCheckpoint = { epoch: 0, root: 'block1' };
      
      // When: 3 validators attest to epoch 1 with source = epoch 0
      const attestations = [
        createAttestation('validator0', 'block2', 0, 'block1', 1, 'block2'),
        createAttestation('validator1', 'block2', 0, 'block1', 1, 'block2'),
        createAttestation('validator2', 'block2', 0, 'block1', 1, 'block2')
      ];
      
      CasperFFG.applyAttestationsToBeaconState(beaconState, attestations);
      
      // Then: Epoch 1 justified, Epoch 0 finalized
      expect(beaconState.justifiedCheckpoint.epoch).toBe(1);
      expect(beaconState.justifiedCheckpoint.root).toBe('block2');
      expect(beaconState.previousJustifiedCheckpoint?.epoch).toBe(0);
      expect(beaconState.finalizedCheckpoint?.epoch).toBe(0);
      expect(beaconState.finalizedCheckpoint?.root).toBe('block1');
    });
    
    it('should NOT finalize when justified epochs are not consecutive', () => {
      // Given: Epoch 0 justified, skip to epoch 2
      const beaconState = createMockBeaconState(4);
      beaconState.justifiedCheckpoint = { epoch: 0, root: 'block1' };
      
      // When: Justify epoch 2 (skipping epoch 1)
      const attestations = [
        createAttestation('validator0', 'block3', 0, 'block1', 2, 'block3'),
        createAttestation('validator1', 'block3', 0, 'block1', 2, 'block3'),
        createAttestation('validator2', 'block3', 0, 'block1', 2, 'block3')
      ];
      
      CasperFFG.applyAttestationsToBeaconState(beaconState, attestations);
      
      // Then: Epoch 2 justified but nothing finalized (not consecutive)
      expect(beaconState.justifiedCheckpoint.epoch).toBe(2);
      expect(beaconState.previousJustifiedCheckpoint?.epoch).toBe(0);
      expect(beaconState.finalizedCheckpoint).toBeNull(); // Not consecutive!
    });
    
    it('should ignore attestations with wrong source checkpoint', () => {
      // Given: Epoch 0 justified
      const beaconState = createMockBeaconState(4);
      beaconState.justifiedCheckpoint = { epoch: 0, root: 'block1' };
      
      // When: Attestations with wrong source (source = -1 instead of 0)
      const attestations = [
        createAttestation('validator0', 'block2', -1, null, 1, 'block2'),
        createAttestation('validator1', 'block2', -1, null, 1, 'block2'),
        createAttestation('validator2', 'block2', -1, null, 1, 'block2')
      ];
      
      CasperFFG.applyAttestationsToBeaconState(beaconState, attestations);
      
      // Then: Attestations ignored, nothing changes
      expect(beaconState.justifiedCheckpoint.epoch).toBe(0); // Still 0
      expect(beaconState.finalizedCheckpoint).toBeNull();
    });
    
    it('should replace validator old vote when new attestation received', () => {
      // Given: Validator0 already voted for block1
      const beaconState = createMockBeaconState(4);
      const oldAttestation = createAttestation('validator0', 'block1', -1, null, 0, 'block1');
      CasperFFG.applyAttestationsToBeaconState(beaconState, [oldAttestation]);
      
      // When: Validator0 votes for block2 instead
      const newAttestation = createAttestation('validator0', 'block2', -1, null, 0, 'block2');
      CasperFFG.applyAttestationsToBeaconState(beaconState, [newAttestation]);
      
      // Then: Old vote removed, new vote counted
      expect(beaconState.latestAttestationByValidator['validator0'].blockHash).toBe('block2');
      // Old vote bucket cleaned up (empty after removal)
      expect(beaconState.ffgVoteCounts[0]?.['block1']).toBeUndefined();
      expect(beaconState.ffgVoteCounts[0]?.['block2']?.has('validator0')).toBe(true);
    });
    
    it('should handle multiple blocks competing for same epoch', () => {
      // Given: 4 validators
      const beaconState = createMockBeaconState(4);
      
      // When: 2 validators vote for block1, 2 vote for block2 (split vote)
      const attestations = [
        createAttestation('validator0', 'block1', -1, null, 0, 'block1'),
        createAttestation('validator1', 'block1', -1, null, 0, 'block1'),
        createAttestation('validator2', 'block2', -1, null, 0, 'block2'),
        createAttestation('validator3', 'block2', -1, null, 0, 'block2')
      ];
      
      CasperFFG.applyAttestationsToBeaconState(beaconState, attestations);
      
      // Then: Neither block justified (each has only 2/4 votes, need 3)
      expect(beaconState.justifiedCheckpoint.epoch).toBe(-1);
      expect(beaconState.ffgVoteCounts[0]['block1'].size).toBe(2);
      expect(beaconState.ffgVoteCounts[0]['block2'].size).toBe(2);
    });
    
    it('should garbage collect old vote buckets after finalization', () => {
      // Given: Finalize epoch 0
      const beaconState = createMockBeaconState(4);
      
      // Justify epoch 0
      const attestations1 = [
        createAttestation('validator0', 'block1', -1, null, 0, 'block1'),
        createAttestation('validator1', 'block1', -1, null, 0, 'block1'),
        createAttestation('validator2', 'block1', -1, null, 0, 'block1')
      ];
      CasperFFG.applyAttestationsToBeaconState(beaconState, attestations1);
      
      // Justify epoch 1 (finalizes epoch 0)
      const attestations2 = [
        createAttestation('validator0', 'block2', 0, 'block1', 1, 'block2'),
        createAttestation('validator1', 'block2', 0, 'block1', 1, 'block2'),
        createAttestation('validator2', 'block2', 0, 'block1', 1, 'block2')
      ];
      CasperFFG.applyAttestationsToBeaconState(beaconState, attestations2);
      
      // Then: Vote buckets for epoch 0 and below should be garbage collected
      expect(beaconState.ffgVoteCounts[-1]).toBeUndefined();
      expect(beaconState.ffgVoteCounts[0]).toBeUndefined();
      expect(beaconState.ffgVoteCounts[1]).toBeDefined(); // Epoch 1 still there
    });
    
    it('should maintain monotonicity - justified epoch never decreases', () => {
      // Given: Epoch 2 already justified
      const beaconState = createMockBeaconState(4);
      beaconState.justifiedCheckpoint = { epoch: 2, root: 'block3' };
      
      // When: Try to justify epoch 1 (lower than current)
      const attestations = [
        createAttestation('validator0', 'block2', 2, 'block3', 1, 'block2'),
        createAttestation('validator1', 'block2', 2, 'block3', 1, 'block2'),
        createAttestation('validator2', 'block2', 2, 'block3', 1, 'block2')
      ];
      
      CasperFFG.applyAttestationsToBeaconState(beaconState, attestations);
      
      // Then: Justified checkpoint stays at epoch 2 (monotonicity - fancy word hehehe - preserved)
      expect(beaconState.justifiedCheckpoint.epoch).toBe(2);
    });
    
    it('should handle 3 validators with threshold of 2', () => {
      // Given: 3 validators, threshold = 2 (ceil(2*3/3))
      const beaconState = createMockBeaconState(3);
      
      // When: 2 validators attest (exactly 2/3)
      const attestations = [
        createAttestation('validator0', 'block1', -1, null, 0, 'block1'),
        createAttestation('validator1', 'block1', -1, null, 0, 'block1')
      ];
      
      CasperFFG.applyAttestationsToBeaconState(beaconState, attestations);
      
      // Then: Epoch 0 justified
      expect(beaconState.justifiedCheckpoint.epoch).toBe(0);
    });
  });
});

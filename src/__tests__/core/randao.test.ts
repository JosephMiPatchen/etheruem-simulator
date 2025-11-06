/**
 * Unit tests for RANDAO class
 * Tests validator scheduling, RANDAO reveals, and mix updates
 */

import { RANDAO } from '../../core/consensus/randao';
import { BeaconState, Validator } from '../../core/consensus/beaconState';
import { Node } from '../../core/node';

describe('RANDAO', () => {
  let beaconState: BeaconState;
  let validators: Validator[];
  let genesisTime: number;

  beforeEach(() => {
    // Set up test beacon state with 4 validators
    genesisTime = Math.floor(Date.now() / 1000);
    validators = [
      { nodeAddress: 'address1', stakedEth: 32 },
      { nodeAddress: 'address2', stakedEth: 32 },
      { nodeAddress: 'address3', stakedEth: 16 }, // Half stake
      { nodeAddress: 'address4', stakedEth: 32 },
    ];
    beaconState = new BeaconState(genesisTime, validators);
  });

  describe('getProposerSchedule', () => {
    it('should return 32 proposer addresses for target epoch', () => {
      const targetEpoch = 1;
      const schedule = RANDAO.getProposerSchedule(beaconState, targetEpoch);
      
      expect(schedule).toHaveLength(32);
      expect(schedule.every(addr => typeof addr === 'string')).toBe(true);
    });

    it('should only select from active validators', () => {
      const targetEpoch = 1;
      const schedule = RANDAO.getProposerSchedule(beaconState, targetEpoch);
      const validAddresses = validators.map(v => v.nodeAddress);
      
      schedule.forEach(address => {
        expect(validAddresses).toContain(address);
      });
    });

    it('should be deterministic for same beacon state and epoch', () => {
      const targetEpoch = 2;
      const schedule1 = RANDAO.getProposerSchedule(beaconState, targetEpoch);
      const schedule2 = RANDAO.getProposerSchedule(beaconState, targetEpoch);
      
      expect(schedule1).toEqual(schedule2);
    });

    it('should produce different schedules for different epochs', () => {
      const schedule1 = RANDAO.getProposerSchedule(beaconState, 1);
      const schedule2 = RANDAO.getProposerSchedule(beaconState, 2);
      
      expect(schedule1).not.toEqual(schedule2);
    });
  });

  describe('calculateRandaoReveal', () => {
    it('should generate BLS signature for epoch', () => {
      const node = new Node('TestNode', genesisTime, validators);
      const epoch = 5;
      
      const reveal = RANDAO.calculateRandaoReveal(epoch, node);
      
      expect(typeof reveal).toBe('string');
      expect(reveal.length).toBeGreaterThan(0);
    });

    it('should generate different reveals for different epochs', () => {
      const node = new Node('TestNode', genesisTime, validators);
      
      const reveal1 = RANDAO.calculateRandaoReveal(1, node);
      const reveal2 = RANDAO.calculateRandaoReveal(2, node);
      
      expect(reveal1).not.toEqual(reveal2);
    });

    it('should be deterministic for same epoch and node', () => {
      const node = new Node('TestNode', genesisTime, validators);
      const epoch = 3;
      
      const reveal1 = RANDAO.calculateRandaoReveal(epoch, node);
      const reveal2 = RANDAO.calculateRandaoReveal(epoch, node);
      
      expect(reveal1).toEqual(reveal2);
    });
  });

  describe('updateRandaoMix', () => {
    it('should update RANDAO mix with XOR of current mix and reveal', () => {
      const epoch = 0;
      const initialMix = beaconState.getRandaoMix(epoch);
      const reveal = 'abcdef1234567890';
      
      RANDAO.updateRandaoMix(beaconState, epoch, reveal);
      
      const updatedMix = beaconState.getRandaoMix(epoch);
      expect(updatedMix).not.toEqual(initialMix);
      expect(typeof updatedMix).toBe('string');
    });

    it('should accumulate multiple reveals via XOR', () => {
      const epoch = 1;
      const reveal1 = 'aaaa';
      const reveal2 = 'bbbb';
      
      RANDAO.updateRandaoMix(beaconState, epoch, reveal1);
      const afterFirst = beaconState.getRandaoMix(epoch);
      
      RANDAO.updateRandaoMix(beaconState, epoch, reveal2);
      const afterSecond = beaconState.getRandaoMix(epoch);
      
      expect(afterFirst).not.toEqual(afterSecond);
    });
  });
});

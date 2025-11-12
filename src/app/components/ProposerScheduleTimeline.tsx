import React from 'react';
import { BeaconState } from '../../core/consensus/beaconState';
import { getNodeColorCSS } from '../../utils/nodeColorUtils';
import './ProposerScheduleTimeline.css';

interface ProposerScheduleTimelineProps {
  beaconState: BeaconState;
  addressToNodeId: { [address: string]: string };
}

/**
 * ProposerScheduleTimeline - Compact visualization of proposer schedules across epochs
 * Shows multiple epochs in a space-efficient timeline format
 */
const ProposerScheduleTimeline: React.FC<ProposerScheduleTimelineProps> = ({ 
  beaconState, 
  addressToNodeId 
}) => {
  const currentSlot = beaconState.getCurrentSlot();
  const currentEpoch = beaconState.getCurrentEpoch();
  
  // Get all proposer schedules sorted by epoch
  const proposerSchedules = Array.from(beaconState.proposerSchedules.entries())
    .sort(([epochA], [epochB]) => epochA - epochB);
  
  // Show latest 6 epochs (or all if less than 6)
  const displaySchedules = proposerSchedules.slice(-6);
  
  return (
    <div className="schedule-timeline">
      <div className="timeline-header">
        <h3>Proposer Schedule Timeline</h3>
        <div className="timeline-info">
          <span className="current-slot-indicator">Current: Slot {currentSlot}</span>
          <span className="current-epoch-indicator">Epoch {currentEpoch}</span>
        </div>
      </div>
      
      <div className="timeline-epochs">
        {displaySchedules.map(([epoch, schedule]) => {
          const slots = Array.from(schedule.entries()).sort(([slotA], [slotB]) => slotA - slotB);
          const isCurrentEpoch = epoch === currentEpoch;
          const firstSlot = slots[0]?.[0] ?? 0;
          const lastSlot = slots[slots.length - 1]?.[0] ?? 0;
          
          return (
            <div 
              key={epoch} 
              className={`timeline-epoch ${isCurrentEpoch ? 'current-epoch' : ''}`}
            >
              <div className="epoch-label">
                <span className="epoch-number">E{epoch}</span>
                <span className="epoch-range">{firstSlot}-{lastSlot}</span>
              </div>
              
              <div className="epoch-slots">
                {slots.map(([slot, validatorAddress]) => {
                  const nodeId = addressToNodeId[validatorAddress] || 'Unknown';
                  const nodeColor = getNodeColorCSS(nodeId);
                  const isCurrentSlot = slot === currentSlot;
                  const isPastSlot = slot < currentSlot;
                  
                  return (
                    <div
                      key={slot}
                      className={`slot-box ${isCurrentSlot ? 'current' : ''} ${isPastSlot ? 'past' : ''}`}
                      style={{ 
                        backgroundColor: nodeColor,
                        opacity: isPastSlot ? 0.4 : 1
                      }}
                      title={`Slot ${slot}: ${nodeId}`}
                    >
                      {isCurrentSlot && <div className="current-marker">▶</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      
      {displaySchedules.length === 0 && (
        <div className="timeline-empty">No proposer schedules computed yet</div>
      )}
    </div>
  );
};

export default ProposerScheduleTimeline;

import React, { useEffect, useRef } from 'react';
import { BeaconState } from '../../core/consensus/beaconState';
import { getNodeColorCSS } from '../../utils/nodeColorUtils';
import './ProposerScheduleTimeline.css';

interface ProposerScheduleTimelineProps {
  beaconState: BeaconState;
  addressToNodeId: { [address: string]: string };
}

/**
 * ProposerScheduleTimeline - Compact grid visualization of proposer schedules
 * Shows epochs 0-24+ in a space-efficient grid with colored cells
 * Auto-scrolls to show latest epochs while allowing manual scroll to view history
 */
const ProposerScheduleTimeline: React.FC<ProposerScheduleTimelineProps> = ({ 
  beaconState, 
  addressToNodeId 
}) => {
  const currentSlot = beaconState.getCurrentSlot();
  const currentEpoch = beaconState.getCurrentEpoch();
  const gridContainerRef = useRef<HTMLDivElement>(null);
  
  // Get all proposer schedules sorted by epoch
  const proposerSchedules = Array.from(beaconState.proposerSchedules.entries())
    .sort(([epochA], [epochB]) => epochA - epochB);
  
  // Get unique node colors for legend
  const uniqueNodes = new Set<string>();
  proposerSchedules.forEach(([_, schedule]) => {
    schedule.forEach((address) => {
      const nodeId = addressToNodeId[address];
      if (nodeId) uniqueNodes.add(nodeId);
    });
  });
  const nodeColors = Array.from(uniqueNodes).map(nodeId => ({
    nodeId,
    color: getNodeColorCSS(nodeId)
  }));
  
  // Auto-scroll to bottom on initial mount only (not on every update)
  useEffect(() => {
    if (gridContainerRef.current) {
      gridContainerRef.current.scrollTop = gridContainerRef.current.scrollHeight;
    }
  }, []); // Empty dependency array = only run once on mount
  
  return (
    <div className="schedule-timeline-panel">
      <div className="timeline-panel-header">
        <div>
          <h3>Proposer Schedule</h3>
          <span className="timeline-subtitle">Epochs {proposerSchedules[0]?.[0] ?? 0} - {proposerSchedules[proposerSchedules.length - 1]?.[0] ?? 0}</span>
        </div>
        <div className="timeline-status">
          <span className="status-item">Slot: <strong>{currentSlot}</strong></span>
          <span className="status-item">Epoch: <strong>{currentEpoch}</strong></span>
        </div>
      </div>
      
      {/* Legend */}
      <div className="schedule-legend">
        <div className="legend-item">
          <div className="legend-boxes">
            {nodeColors.map(({ nodeId, color }) => (
              <div 
                key={nodeId}
                className="legend-box current-outline"
                style={{ backgroundColor: color }}
                title={nodeId}
              />
            ))}
          </div>
          <span className="legend-label">= Current Proposer (orange outline)</span>
        </div>
      </div>
      
      {/* Epoch Grid - Scrollable Container */}
      <div className="epochs-grid-container" ref={gridContainerRef}>
        <div className="epochs-grid">
        {proposerSchedules.map(([epoch, schedule]) => {
          const slots = Array.from(schedule.entries()).sort(([slotA], [slotB]) => slotA - slotB);
          const isCurrentEpoch = epoch === currentEpoch;
          
          return (
            <div key={epoch} className={`epoch-cell ${isCurrentEpoch ? 'current-epoch' : ''}`}>
              <div className="epoch-cell-header">Epoch {epoch}</div>
              <div className="epoch-slots-grid">
                {slots.map(([slot, validatorAddress]) => {
                  const nodeId = addressToNodeId[validatorAddress] || 'Unknown';
                  const nodeColor = getNodeColorCSS(nodeId);
                  const isCurrentSlot = slot === currentSlot;
                  const isPastSlot = slot < currentSlot;
                  
                  return (
                    <div
                      key={slot}
                      className={`slot-cell ${isCurrentSlot ? 'current-slot' : ''} ${isPastSlot ? 'past-slot' : ''}`}
                      style={{ 
                        backgroundColor: nodeColor,
                        opacity: isPastSlot ? 0.4 : 1
                      }}
                      title={`Slot ${slot}: ${nodeId}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
        </div>
      </div>
      
      {proposerSchedules.length === 0 && (
        <div className="timeline-empty">No proposer schedules computed yet</div>
      )}
    </div>
  );
};

export default ProposerScheduleTimeline;

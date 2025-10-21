import React, { createContext, useContext, useState, ReactNode } from 'react';
import { NodeState } from '../../types/types';
import { ForkDetectionService } from '../utils/forkDetectionService';

interface SimulatorContextType {
  forkStartHeight: number | null;
  detectForks: (nodeStates: Record<string, NodeState>) => void;
  addressToNodeId: Record<string, string>; // Maps address (sha256 of publicKey) to human-readable nodeId
  setAddressToNodeId: (mapping: Record<string, string>) => void;
}

const SimulatorContext = createContext<SimulatorContextType | undefined>(undefined);

export const useSimulatorContext = () => {
  const context = useContext(SimulatorContext);
  if (context === undefined) {
    throw new Error('useSimulatorContext must be used within a SimulatorProvider');
  }
  return context;
};

interface SimulatorProviderProps {
  children: ReactNode;
}

export const SimulatorProvider: React.FC<SimulatorProviderProps> = ({ children }) => {
  const [forkStartHeight, setForkStartHeight] = useState<number | null>(null);
  const [addressToNodeId, setAddressToNodeId] = useState<Record<string, string>>({});

  const detectForks = (nodeStates: Record<string, NodeState>) => {
    const newForkHeight = ForkDetectionService.detectForks(nodeStates);
    setForkStartHeight(newForkHeight);
  };

  return (
    <SimulatorContext.Provider value={{ 
      forkStartHeight, 
      detectForks,
      addressToNodeId,
      setAddressToNodeId
    }}>
      {children}
    </SimulatorContext.Provider>
  );
};

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { NodeState } from '../../types/types';
import { ForkDetectionService } from '../utils/forkDetectionService';

interface SimulatorContextType {
  forkStartHeight: number | null;
  detectForks: (nodeStates: Record<string, NodeState>) => void;
  // We can add other simulator-related state and functions here in the future
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

  const detectForks = (nodeStates: Record<string, NodeState>) => {
    const newForkHeight = ForkDetectionService.detectForks(nodeStates);
    setForkStartHeight(newForkHeight);
  };

  return (
    <SimulatorContext.Provider value={{ forkStartHeight, detectForks }}>
      {children}
    </SimulatorContext.Provider>
  );
};

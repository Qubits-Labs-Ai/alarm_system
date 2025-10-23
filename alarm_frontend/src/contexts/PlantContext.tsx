/**
 * Plant Context - Manages selected plant for Actual-Calc mode
 * 
 * This context provides plant selection state across the application,
 * enabling dynamic multi-plant support for actual-calc dashboards.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { PlantInfo, fetchAvailablePlants } from '@/api/actualCalc';

interface PlantContextType {
  // Current selected plant ID
  selectedPlant: string;
  
  // Function to change selected plant
  setSelectedPlant: (plantId: string) => void;
  
  // List of available plants
  plants: PlantInfo[];
  
  // Loading state for plants list
  plantsLoading: boolean;
  
  // Error state
  plantsError: string | null;
  
  // Get info for currently selected plant
  getCurrentPlantInfo: () => PlantInfo | undefined;
}

const PlantContext = createContext<PlantContextType | undefined>(undefined);

interface PlantProviderProps {
  children: ReactNode;
  defaultPlantId?: string;
}

const STORAGE_KEY = 'ams.selectedPlant';

export function PlantProvider({ children, defaultPlantId = 'PVCI' }: PlantProviderProps) {
  // Initialize from localStorage or default
  const [selectedPlant, setSelectedPlantState] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored || defaultPlantId;
    } catch {
      return defaultPlantId;
    }
  });

  const [plants, setPlants] = useState<PlantInfo[]>([]);
  const [plantsLoading, setPlantsLoading] = useState(true);
  const [plantsError, setPlantsError] = useState<string | null>(null);

  // Fetch available plants on mount
  useEffect(() => {
    let mounted = true;

    async function loadPlants() {
      try {
        setPlantsLoading(true);
        setPlantsError(null);
        const response = await fetchAvailablePlants();
        
        if (mounted) {
          setPlants(response.plants || []);
          
          // If selected plant is not in the list, switch to first available
          const plantIds = response.plants.map(p => p.id);
          if (!plantIds.includes(selectedPlant) && plantIds.length > 0) {
            setSelectedPlantState(plantIds[0]);
          }
        }
      } catch (error) {
        console.error('Failed to load plants:', error);
        if (mounted) {
          setPlantsError(error instanceof Error ? error.message : 'Failed to load plants');
          // Fallback to default plants if API fails
          setPlants([
            { id: 'PVCI', name: 'PVC-I Plant', display_name: 'PVC-I', description: 'PVC-I Manufacturing Plant', active: true },
            { id: 'VCMA', name: 'VCM-A Plant', display_name: 'VCM-A', description: 'Vinyl Chloride Monomer - Plant A', active: true },
          ]);
        }
      } finally {
        if (mounted) {
          setPlantsLoading(false);
        }
      }
    }

    loadPlants();

    return () => {
      mounted = false;
    };
  }, [selectedPlant]);

  // Persist selection to localStorage
  const setSelectedPlant = (plantId: string) => {
    setSelectedPlantState(plantId);
    try {
      localStorage.setItem(STORAGE_KEY, plantId);
    } catch (error) {
      console.warn('Failed to save plant selection:', error);
    }
  };

  // Get info for current plant
  const getCurrentPlantInfo = () => {
    return plants.find(p => p.id === selectedPlant);
  };

  const value: PlantContextType = {
    selectedPlant,
    setSelectedPlant,
    plants,
    plantsLoading,
    plantsError,
    getCurrentPlantInfo,
  };

  return <PlantContext.Provider value={value}>{children}</PlantContext.Provider>;
}

/**
 * Hook to access plant context
 * 
 * @example
 * const { selectedPlant, setSelectedPlant, plants } = usePlantContext();
 */
export function usePlantContext() {
  const context = useContext(PlantContext);
  if (context === undefined) {
    throw new Error('usePlantContext must be used within a PlantProvider');
  }
  return context;
}

/**
 * Hook to get current plant ID (shorthand)
 */
export function useSelectedPlant() {
  const { selectedPlant } = usePlantContext();
  return selectedPlant;
}

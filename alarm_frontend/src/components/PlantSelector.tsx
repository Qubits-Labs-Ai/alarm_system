/**
 * PlantSelector - Dropdown to switch between plants
 * 
 * Displays available plants and allows user to select which plant's
 * actual-calc data to view.
 */

import { usePlantContext } from '@/contexts/PlantContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

export function PlantSelector() {
  const { selectedPlant, setSelectedPlant, plants, plantsLoading, plantsError } = usePlantContext();

  if (plantsLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading plants...</span>
      </div>
    );
  }

  if (plantsError || plants.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-destructive">
        <span>⚠️ No plants available</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="plant-select" className="text-sm font-medium text-foreground">
        Plant:
      </label>
      <Select value={selectedPlant} onValueChange={setSelectedPlant}>
        <SelectTrigger id="plant-select" className="w-[140px]">
          <SelectValue placeholder="Select plant" />
        </SelectTrigger>
        <SelectContent>
          {plants.map((plant) => (
            <SelectItem key={plant.id} value={plant.id}>
              <div className="flex flex-col">
                <span className="font-medium">{plant.display_name}</span>
                {plant.active && (
                  <span className="text-xs text-green-600 dark:text-green-400">Active</span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

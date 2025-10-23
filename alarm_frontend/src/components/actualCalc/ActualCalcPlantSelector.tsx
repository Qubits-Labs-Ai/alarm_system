/**
 * ActualCalcPlantSelector - Plant selector for Actual-Calc mode
 * 
 * Uses PlantContext to display and switch between available plants
 * for actual-calc analytics.
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

export function ActualCalcPlantSelector() {
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
      <label htmlFor="actual-calc-plant-select" className="text-sm font-medium text-foreground whitespace-nowrap">
        Plant:
      </label>
      <Select value={selectedPlant} onValueChange={setSelectedPlant}>
        <SelectTrigger id="actual-calc-plant-select" className="w-[130px] h-9">
          <SelectValue placeholder="Select plant" />
        </SelectTrigger>
        <SelectContent>
          {plants.map((plant) => (
            <SelectItem key={plant.id} value={plant.id}>
              <div className="flex items-center gap-2">
                <span className="font-medium">{plant.display_name}</span>
                {plant.active && (
                  <span className="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                    Active
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

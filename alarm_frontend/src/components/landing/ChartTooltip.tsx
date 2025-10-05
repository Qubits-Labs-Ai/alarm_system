import { useTheme } from '@/hooks/useTheme';

// A reusable chart tooltip with professional styling consistent with the dashboard
export const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const value = payload[0].value;
    const name = payload[0].name;

    return (
      <div className="rounded-lg border bg-popover p-2 shadow-sm text-sm text-popover-foreground">
        <div className="grid grid-cols-[1fr_auto] items-center gap-x-2 font-semibold">
          <p className="text-muted-foreground">{label || data.name}</p>
          <p>{value}</p>
        </div>
        {name && (
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-2">
            <p className="text-muted-foreground">Category</p>
            <p>{name}</p>
          </div>
        )}
      </div>
    );
  }

  return null;
};

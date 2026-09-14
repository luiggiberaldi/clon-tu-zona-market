import { Card, CardContent } from '@/components/ui/card';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export function StatsCard({
  label,
  value,
  icon,
  hint,
  className
}: {
  label: string;
  value: string | number;
  icon?: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <Card className={cn(className)}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          {icon}
        </div>
        <p className="mt-2 text-2xl font-bold">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function StatsCards({
  stats
}: {
  stats: Array<{ label: string; value: string | number; hint?: string }>;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((s) => (
        <StatsCard key={s.label} label={s.label} value={s.value} hint={s.hint} />
      ))}
    </div>
  );
}

import { AlertTriangle } from 'lucide-react';
import { formatMoney } from './formatters';

export function MinOrderExceeded({ met, min }: { met: boolean; min: number }) {
  if (met) return null;
  return (
    <p className="flex items-center gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      Pedido mínimo: {formatMoney(min, 'USD')}
    </p>
  );
}

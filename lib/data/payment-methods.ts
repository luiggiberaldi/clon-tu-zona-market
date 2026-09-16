import type { PaymentMethodConfig } from '@/types/commerce';

export const canonicalPaymentMethods: PaymentMethodConfig[] = [
  {
    id: 'pagomovil',
    label: 'PagoMóvil (Bs)',
    currency: 'VES',
    enabled: true,
    instructions: `📱 Datos de PagoMóvil (Demostración / Ficticio):
• Banco: Banesco (0134) o Banco de Venezuela (0102)
• Teléfono: 0414-1234567
• Cédula: V-20.123.456
• Titular: Todo Market Venezuela C.A.

⚠️ Puedes ingresar cualquier número de referencia de 6 a 12 dígitos al finalizar tu compra para simular la verificación.`
  },
  {
    id: 'transfer',
    label: 'Transferencia Bancaria (Bs / USD)',
    currency: 'VES',
    enabled: true,
    instructions: `🏦 Datos de Transferencia (Demostración / Ficticio):
• Banco: Banesco Banco Universal
• Cuenta Corriente: 0134-0987-65-1234567890
• Beneficiario: Inversiones Todo Market C.A.
• RIF: J-40123456-7

⚠️ Para pagos en divisas USD nacionales, también disponemos de cuenta custodia Banesco Panamá / Nacional.`
  },
  {
    id: 'zelle',
    label: 'Zelle (USD)',
    currency: 'USD',
    enabled: true,
    instructions: `💵 Datos de Zelle (Demostración / Ficticio):
• Correo Zelle: pagos@todomarket.com
• Titular de la cuenta: Todo Market LLC
• Concepto / Memo: Tu nombre o número de teléfono

⚠️ Monto mínimo: $10.00 USD. La confirmación es instantánea en modo simulación.`
  },
  {
    id: 'binance',
    label: 'Binance Pay (USDT)',
    currency: 'USD',
    enabled: true,
    instructions: `🟡 Datos de Binance Pay (Demostración / Ficticio):
• Binance Pay ID: 284910382
• Nickname: TodoMarket_Oficial
• Criptomoneda: USDT (Tether)

⚠️ Transfiere sin comisiones entre usuarios de Binance. Ingresa tu ID de orden o transacción.`
  },
  {
    id: 'card',
    label: 'Tarjeta de Crédito / Débito',
    currency: 'USD',
    enabled: true,
    instructions: `💳 Pasarela Virtual de Tarjeta (Demostración / Ficticio):
• Acepta tarjetas internacionales Visa, Mastercard, AMEX y débito nacional
• Pasarela de pago simulada con protección SSL 256-bit
• Procesamiento y aprobación automática inmediata para demostración.`
  },
  {
    id: 'cash',
    label: 'Efectivo en Entrega ($ USD / Bs)',
    currency: 'USD',
    enabled: true,
    instructions: `💵 Pago en Efectivo al Recibir:
• Paga en efectivo al repartidor al momento de recibir tu pedido.
• Puedes pagar en divisas ($ USD) o en bolívares (Bs) calculados a la tasa oficial del día.
• Si necesitas vuelto o cambio, indícalo en las instrucciones de entrega.`
  }
];

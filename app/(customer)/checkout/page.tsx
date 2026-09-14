import { CheckoutForm } from '@/components/checkout/CheckoutForm';

export default function CheckoutPage() {
  return (
    <div className="container-prose py-6 lg:py-10">
      <h1 className="text-2xl font-bold lg:text-3xl">Finalizar compra</h1>
      <p className="mt-1 text-muted-foreground">
        Revisa tu pedido, selecciona dirección, horario y método de pago.
      </p>
      <div className="mt-6">
        <CheckoutForm />
      </div>
    </div>
  );
}

import Stripe from "stripe";

// Lazy singleton: evitamos instanciar el SDK al importar el módulo (algunos
// callers son rutas que se cargan en el edge runtime y no toleran constructores
// con side effects). Si la key no está configurada, el getter lanza con
// un mensaje claro que el admin pueda mostrar en el UI.
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY no está configurada en el servidor. " +
        "Agregala a .env.local (dev) o al .env del servidor (prod)."
    );
  }
  _stripe = new Stripe(key, {
    // No fijamos apiVersion para que use la default del SDK; reduce churn al
    // actualizar el paquete.
    typescript: true,
  });
  return _stripe;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

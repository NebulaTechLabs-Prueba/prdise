/**
 * Calendario externo del proveedor de traslados.
 *
 * Stand-by: proveedor aún no notificado. Cuando se conozca, este módulo expondrá:
 *   - sincronización (pull o webhook) de disponibilidad
 *   - mapeo a la tabla local de slots
 *   - reconciliación de bloqueos manuales del admin con los del proveedor
 *
 * Por ahora retorna estructura vacía para que la UI pueda iterar sin romper.
 */

export type AvailabilitySlot = {
  date: string;          // YYYY-MM-DD en TZ America/Puerto_Rico
  startTime: string;     // HH:mm
  endTime: string;       // HH:mm
  available: boolean;
  source: "local" | "external";
};

export async function fetchExternalAvailability(_params: {
  from: string;
  to: string;
}): Promise<AvailabilitySlot[]> {
  return [];
}

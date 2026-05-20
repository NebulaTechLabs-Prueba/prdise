-- ============================================================================
-- Permite al dueño de un booking CANCELAR la propia reserva si todavía está
-- en estado 'pending' o 'pending_payment'. Sin esta policy, el UPDATE desde
-- bookings/actions.ts::cancelBooking afecta 0 filas en silencio (RLS).
-- ============================================================================

create policy bookings_cancel_own_pending on public.bookings
  for update
  using (
    auth.uid() = user_id
    and status in ('pending', 'pending_payment')
  )
  with check (
    auth.uid() = user_id
    and status = 'cancelled'
  );

-- A confirmation belongs to a reservation, not just a trip: the reservation
-- card shows "View confirmation". Additive; set null if the reservation goes.
alter table mission.rv_documents
  add column if not exists reservation_id uuid references mission.rv_reservations(id) on delete set null;
create index if not exists rv_documents_reservation_idx on mission.rv_documents (reservation_id);
notify pgrst, 'reload schema';

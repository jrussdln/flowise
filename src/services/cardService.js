/* ------------------------------------------------------------------
    Card service — the ONLY place the frontend knows about /api/cards
    (the Cards tab: debit + credit cards).

    Pages/components call these functions; they never touch Supabase or
    fetch directly. Mirrors the backend model:
      GET    /api/cards      list (each card carries its balance
                             figures: dBalance for debit, dOutstanding
                             + dAvailable for credit)
      GET    /api/cards/:id  single (same figures)
      POST   /api/cards      create (server forces cStatus "A", and
                             dCreditLimit null on a debit card)
      PUT    /api/cards/:id  update (partial)
      DELETE /api/cards/:id  delete (drops the card's transactions too)
      GET    /api/cards/:id/transactions  the ledger rows charged to
                             this card (the card's View dialog)
    ------------------------------------------------------------------ */

import { api } from "./api";

export const cardService = {
  async list() {
    const json = await api.get("/cards");
    return json.data ?? [];
  },

  async getById(id) {
    const json = await api.get(`/cards/${id}`);
    return json.data;
  },

  async create(payload) {
    const json = await api.post("/cards", payload);
    return json.data;
  },

  async update(id, payload) {
    const json = await api.put(`/cards/${id}`, payload);
    return json.data;
  },

  async remove(id) {
    await api.delete(`/cards/${id}`);
  },

  /** The transactions charged to this card, newest first. */
  async listTransactions(cardId) {
    const json = await api.get(`/cards/${cardId}/transactions`);
    return json.data ?? [];
  },
};

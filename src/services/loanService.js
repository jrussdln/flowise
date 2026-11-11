/* ------------------------------------------------------------------
   Loan service — the ONLY place the frontend knows about /api/loans
   and /api/entries (the payment schedule behind a loan's View button,
   and the purchase repayments behind a credit card's View).

   Pages/components call these functions; they never touch Supabase or
   fetch directly. Mirrors the backend model:
     GET    /api/loans      list
     GET    /api/loans/:id  single
     POST   /api/loans      create (server assigns strCode, sets
                            cStatus "P"; the form supplies dttDueDate)
     PUT    /api/loans/:id  update (partial) — { cStatus: "A" } activates
     DELETE /api/loans/:id  delete
     GET    /api/entries?cType=L&nReferenceId=  a loan's schedule
     GET    /api/entries?cType=C&nCardId=       every purchase repayment
                                                on one credit card
     POST   /api/entries                       savings deposit, or the
                                                first payment of a
                                                credit-card purchase
     PUT    /api/entries/:id                    set entry status (X/P/L/A, nCardId when a card pays)
   ------------------------------------------------------------------ */

import { api } from "./api";

export const loanService = {
  async list() {
    const json = await api.get("/loans");
    return json.data ?? [];
  },

  async getById(id) {
    const json = await api.get(`/loans/${id}`);
    return json.data;
  },

  /* Payment schedule for a loan — rows are created server-side when the
     loan activates (GET /api/entries). */
  async listEntries(loanId) {
    const json = await api.get(`/entries?cType=L&nReferenceId=${loanId}`);
    return json.data ?? [];
  },

  /* Repayment entries of every purchase charged to one credit card —
     each row's nReferenceId is the Purchase transaction it settles, so
     the card's View can attach them to its Purchase rows. */
  async listCardEntries(cardId) {
    const json = await api.get(`/entries?cType=C&nCardId=${cardId}`);
    return json.data ?? [];
  },

  /* Schedule + repayment entries behind the BILLS views (the BILLS
     report and the dashboard's "My Bills" section): one call per
     Active/Completed loan (its schedule) and per credit card (its
     purchase repayments), returned as two Maps keyed by id. Failed
     calls are skipped — a missing map entry just leaves that loan/card
     out of the bills. */
  async listBillEntries(loans, cards) {
    const [loanPairs, cardPairs] = await Promise.all([
      Promise.allSettled(
        (loans || [])
          .filter((l) => l.cStatus === "A" || l.cStatus === "C")
          .map(async (l) => [
            Number(l.nLoanId),
            await this.listEntries(Number(l.nLoanId)),
          ])
      ),
      Promise.allSettled(
        (cards || [])
          .filter((c) => c.cType === "C")
          .map(async (c) => [
            Number(c.nCardId),
            await this.listCardEntries(Number(c.nCardId)),
          ])
      ),
    ]);
    return {
      loanEntries: new Map(
        loanPairs.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))
      ),
      cardEntries: new Map(
        cardPairs.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))
      ),
    };
  },

  /* Record a payment: set one entry's status
     (P paid / L late / A advance / X back to pending). Pass `nCardId`
     when a debit card pays it — the server then writes a second ledger
     row (the card's deduction) beside the Payment row. Works for both
     loan entries and card purchase repayments (cType "C"). */
  async updateEntryStatus(entryId, cStatus, nCardId = null) {
    const json = await api.put(`/entries/${entryId}`, {
      cStatus,
      ...(nCardId ? { nCardId } : {}),
    });
    return json.data;
  },

  /* The FIRST payment of a credit-card purchase: creates the repayment
     entry born settled (P on time / L late / A advance — picked by the
     client from the billing due date) and its Payment row in one call.
     `nCardId` names the optional debit card funding it. */
  async createCardEntry({ purchaseId, cStatus, nCardId = null }) {
    const json = await api.post("/entries", {
      cType: "C",
      nReferenceId: purchaseId,
      cStatus,
      ...(nCardId ? { nCardId } : {}),
    });
    return json.data;
  },

  async create(payload) {
    const json = await api.post("/loans", payload);
    return json.data;
  },

  async update(id, payload) {
    const json = await api.put(`/loans/${id}`, payload);
    return json.data;
  },

  async remove(id) {
    await api.delete(`/loans/${id}`);
  },
};

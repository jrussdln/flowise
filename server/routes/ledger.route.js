/* ------------------------------------------------------------------
   Routes for /api/ledger — thin wiring only; logic lives in the
   controller. Mounted by server/app.js (shared by local dev and Vercel).
   ------------------------------------------------------------------ */

import { Router } from "express";
import * as ledgerController from "../controllers/ledger.controller.js";

const router = Router();

router.get("/", ledgerController.listLedger);
router.post("/", ledgerController.createEntry);
router.get("/:id", ledgerController.getEntry);
router.put("/:id", ledgerController.updateEntry);
router.delete("/:id", ledgerController.deleteEntry);

const methodNotAllowed = (allow) => (_req, res) => {
  res.setHeader("Allow", allow);
  res.status(405).json({ ok: false, message: "Method not allowed" });
};
router.all("/", methodNotAllowed("GET, POST"));
router.all("/:id", methodNotAllowed("GET, PUT, DELETE"));

export default router;

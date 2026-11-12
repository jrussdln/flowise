/* ------------------------------------------------------------------
   Routes for /api/loans — thin wiring only; logic lives in the
   controller. Mounted by server/app.js (shared by local dev and Vercel).
   ------------------------------------------------------------------ */

import { Router } from "express";
import * as loanController from "../controllers/loan.controller.js";

const router = Router();

router.get("/", loanController.listLoans);
router.post("/", loanController.createLoan);
router.get("/:id", loanController.getLoan);
router.put("/:id", loanController.updateLoan);
router.delete("/:id", loanController.deleteLoan);

const methodNotAllowed = (allow) => (_req, res) => {
  res.setHeader("Allow", allow);
  res.status(405).json({ ok: false, message: "Method not allowed" });
};
router.all("/", methodNotAllowed("GET, POST"));
router.all("/:id", methodNotAllowed("GET, PUT, DELETE"));

export default router;

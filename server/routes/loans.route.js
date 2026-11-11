/* ------------------------------------------------------------------
   Routes for /api/loans — thin wiring only; logic lives in the
   controller. Mounted by server/app.js, which api/index.js runs as
   Vercel's single Serverless Function (one for all of /api/*).
   ------------------------------------------------------------------ */

import { Router } from "express";
import * as loanController from "../controllers/loan.controller.js";

const router = Router();

router.get("/", loanController.listLoans);
router.post("/", loanController.createLoan);
router.get("/:id", loanController.getLoan);
router.put("/:id", loanController.updateLoan);
router.delete("/:id", loanController.deleteLoan);

/* Wrong method on an existing path -> 405 (matches transactions.route.js).
   Registered after the real routes so they always win. */
const methodNotAllowed = (allow) => (_req, res) => {
  res.setHeader("Allow", allow);
  res.status(405).json({ ok: false, message: "Method not allowed" });
};
router.all("/", methodNotAllowed("GET, POST"));
router.all("/:id", methodNotAllowed("GET, PUT, DELETE"));

export default router;

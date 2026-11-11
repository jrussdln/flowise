/* ------------------------------------------------------------------
   Routes for /api/transactions — thin wiring only; logic lives in the
   controller. Mounted by server/app.js, which api/index.js runs as
   Vercel's single Serverless Function (one for all of /api/*).
   ------------------------------------------------------------------ */

import { Router } from "express";
import * as transactionController from "../controllers/transaction.controller.js";

const router = Router();

router.get("/", transactionController.listTransactions);
router.post("/", transactionController.createTransaction);
router.get("/:id", transactionController.getTransaction);
router.put("/:id", transactionController.updateTransaction);
router.delete("/:id", transactionController.deleteTransaction);

/* Wrong method on an existing path -> 405 (matches users.route.js style).
   Registered after the real routes so they always win. */
const methodNotAllowed = (allow) => (_req, res) => {
  res.setHeader("Allow", allow);
  res.status(405).json({ ok: false, message: "Method not allowed" });
};
router.all("/", methodNotAllowed("GET, POST"));
router.all("/:id", methodNotAllowed("GET, PUT, DELETE"));

export default router;

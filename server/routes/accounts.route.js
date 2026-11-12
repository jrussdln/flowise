/* ------------------------------------------------------------------
   Routes for /api/accounts — thin wiring only; logic lives in the
   controller. Mounted by server/app.js (shared by local dev and Vercel).
   ------------------------------------------------------------------ */

import { Router } from "express";
import * as accountController from "../controllers/account.controller.js";

const router = Router();

/* /balances must be registered before /:id. */
router.get("/balances", accountController.listBalances);
router.get("/", accountController.listAccounts);
router.post("/", accountController.createAccount);
router.get("/:id", accountController.getAccount);
router.put("/:id", accountController.updateAccount);
router.delete("/:id", accountController.deleteAccount);

const methodNotAllowed = (allow) => (_req, res) => {
  res.setHeader("Allow", allow);
  res.status(405).json({ ok: false, message: "Method not allowed" });
};
router.all("/", methodNotAllowed("GET, POST"));
router.all("/:id", methodNotAllowed("GET, PUT, DELETE"));

export default router;

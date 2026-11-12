/* ------------------------------------------------------------------
   Routes for /api/savings — thin wiring only; logic lives in the
   controller. Mounted by server/app.js (shared by local dev and Vercel).
   ------------------------------------------------------------------ */

import { Router } from "express";
import * as savingsController from "../controllers/savings.controller.js";

const router = Router();

router.get("/", savingsController.listSavings);
router.post("/", savingsController.createSavings);
router.get("/:id", savingsController.getSavings);
router.put("/:id", savingsController.updateSavings);
router.delete("/:id", savingsController.deleteSavings);

const methodNotAllowed = (allow) => (_req, res) => {
  res.setHeader("Allow", allow);
  res.status(405).json({ ok: false, message: "Method not allowed" });
};
router.all("/", methodNotAllowed("GET, POST"));
router.all("/:id", methodNotAllowed("GET, PUT, DELETE"));

export default router;

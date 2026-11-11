/* ------------------------------------------------------------------
   Routes for /api/savings — thin wiring only; logic lives in the
   controller. GET/POST list+create; GET/PUT/DELETE /:id. Mounted by
   server/app.js, which api/index.js runs as Vercel's single function.
   ------------------------------------------------------------------ */

import { Router } from "express";
import * as savingController from "../controllers/saving.controller.js";

const router = Router();

router.get("/", savingController.listSavings);
router.post("/", savingController.createSaving);
router.get("/:id", savingController.getSaving);
router.put("/:id", savingController.updateSaving);
router.delete("/:id", savingController.deleteSaving);

/* Wrong method on an existing path -> 405 (matches loans.route.js).
   Registered after the real routes so they always win. */
const methodNotAllowed = (allow) => (_req, res) => {
  res.setHeader("Allow", allow);
  res.status(405).json({ ok: false, message: "Method not allowed" });
};
router.all("/", methodNotAllowed("GET, POST"));
router.all("/:id", methodNotAllowed("GET, PUT, DELETE"));

export default router;

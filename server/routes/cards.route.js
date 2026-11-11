/* ------------------------------------------------------------------
   Routes for /api/cards — thin wiring only; logic lives in the
   controller. GET/POST list+create; GET/PUT/DELETE /:id. Mounted by
   server/app.js, which api/index.js runs as Vercel's single function.
   ------------------------------------------------------------------ */

import { Router } from "express";
import * as cardController from "../controllers/card.controller.js";

const router = Router();

router.get("/", cardController.listCards);
router.post("/", cardController.createCard);
router.get("/:id", cardController.getCard);
router.put("/:id", cardController.updateCard);
router.delete("/:id", cardController.deleteCard);
router.get("/:id/transactions", cardController.listCardTransactions);

/* Wrong method on an existing path -> 405 (matches savings.route.js).
   Registered after the real routes so they always win. */
const methodNotAllowed = (allow) => (_req, res) => {
  res.setHeader("Allow", allow);
  res.status(405).json({ ok: false, message: "Method not allowed" });
};
router.all("/", methodNotAllowed("GET, POST"));
router.all("/:id", methodNotAllowed("GET, PUT, DELETE"));
router.all("/:id/transactions", methodNotAllowed("GET"));

export default router;

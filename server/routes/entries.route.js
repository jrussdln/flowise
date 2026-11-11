/* ------------------------------------------------------------------
   Routes for /api/entries — thin wiring only; logic lives in the
   controller. GET lists a loan's schedule or a saving's deposits;
   POST adds one savings deposit (and its transaction); PUT /:id
   flips one loan entry's X (pending) / P (paid) flag; DELETE /:id
   removes a savings deposit and its transaction. Mounted by
   server/app.js, which api/index.js runs as Vercel's single function.
   ------------------------------------------------------------------ */

import { Router } from "express";
import * as entryController from "../controllers/entry.controller.js";

const router = Router();

router.get("/", entryController.listEntries);
router.post("/", entryController.createEntry);
router.put("/:id", entryController.updateEntry);
router.delete("/:id", entryController.deleteEntry);

/* Wrong method on an existing path -> 405 (matches transactions.route.js).
   Registered after the real routes so it always wins. */
const methodNotAllowed = (allow) => (_req, res) => {
  res.setHeader("Allow", allow);
  res.status(405).json({ ok: false, message: "Method not allowed" });
};
router.all("/", methodNotAllowed("GET, POST"));
router.all("/:id", methodNotAllowed("PUT, DELETE"));

export default router;

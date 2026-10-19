
import { Router } from "express";
import { verifyAuth } from "../middleware/authMiddleware.js";

import {
    getMyRole,
    getMySummary,
} from "../controllers/userController.js";

const router = Router();

router.use(verifyAuth);

router.get("/role", getMyRole);
router.get("/summary", getMySummary);

export default router;

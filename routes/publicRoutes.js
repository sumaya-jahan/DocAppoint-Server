
import { Router } from "express";

import {
    getPublicDoctors,
    getPublicDoctorById,
    getPublicStats,
    createContactMessage,
} from "../controllers/publicController.js";

const router = Router();

// Public doctor endpoints
router.get("/doctors", getPublicDoctors);
router.get("/doctors/:id", getPublicDoctorById);

// Public statistics
router.get("/api/stats", getPublicStats);

// Public contact form
router.post("/api/contact", createContactMessage);

export default router;


import { Router } from "express";
import { verifyAuth } from "../middleware/authMiddleware.js";

import {
    getAppointments,
    createAppointment,
    updateAppointment,
    deleteAppointment,
} from "../controllers/appointmentController.js";

const router = Router();

router.use(verifyAuth);

router.get("/", getAppointments);
router.post("/", createAppointment);
router.put("/:id", updateAppointment);
router.delete("/:id", deleteAppointment);

export default router;


import { Router } from "express";
import {
    getDoctors,
    getDoctorById,
} from "../controllers/doctorController.js";

const router = Router();

router.get("/", getDoctors);
router.get("/:id", getDoctorById);

export default router;

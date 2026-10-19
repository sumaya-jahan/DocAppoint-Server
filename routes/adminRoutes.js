
import { Router } from "express";
import {
    verifyAuth,
    verifyAdmin,
} from "../middleware/authMiddleware.js";

import {
    getAdminOverview,
    getAdminDoctors,
    createAdminDoctor,
    updateAdminDoctor,
    deleteAdminDoctor,
    getAdminUsers,
    getAdminContacts,
} from "../controllers/adminController.js";

const router = Router();

// All admin routes require login and admin permission
router.use(verifyAuth, verifyAdmin);

router.get("/overview", getAdminOverview);

router.get("/doctors", getAdminDoctors);
router.post("/doctors", createAdminDoctor);
router.patch("/doctors/:id", updateAdminDoctor);
router.delete("/doctors/:id", deleteAdminDoctor);

router.get("/users", getAdminUsers);
router.get("/contacts", getAdminContacts);

export default router;


import { auth } from "../auth.js";
import { db } from "../db.js";
import { fromNodeHeaders } from "better-auth/node";

export async function verifyAuth(req, res, next) {
    try {
        const session = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers),
        });

        if (!session?.user?.email) {
            return res.status(401).json({
                message: "Unauthorized",
            });
        }

        req.session = session;
        req.user = session.user;
        next();
    } catch (error) {
        next(error);
    }
}

export async function verifyAdmin(req, res, next) {
    try {
        if (!req.user?.id) {
            return res.status(401).json({
                message: "Unauthorized",
            });
        }

        const role = await db.collection("adminRoles").findOne({
            userId: String(req.user.id),
            role: "admin",
        });

        if (!role) {
            return res.status(403).json({
                message: "Admin permission required",
            });
        }

        next();
    } catch (error) {
        next(error);
    }
}


import { auth } from "../auth.js";
import { db } from "../db.js";
import { fromNodeHeaders } from "better-auth/node";

const adminRolesCollection = db.collection("adminRoles");

export async function verifyAuth(req, res, next) {
    try {
        const session = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers),
        });

        if (!session?.user?.id || !session?.user?.email) {
            return res.status(401).json({
                message: "Unauthorized",
            });
        }

        req.session = session;
        req.user = session.user;

        return next();
    } catch (error) {
        return next(error);
    }
}

export async function verifyAdmin(req, res, next) {
    try {
        if (!req.user?.id) {
            return res.status(401).json({
                message: "Unauthorized",
            });
        }

        const adminRole = await adminRolesCollection.findOne({
            userId: String(req.user.id),
            role: "admin",
        });

        if (!adminRole) {
            return res.status(403).json({
                message: "Admin permission required",
            });
        }

        return next();
    } catch (error) {
        return next(error);
    }
}

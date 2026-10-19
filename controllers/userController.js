
import { db } from "../db.js";

const rolesCollection = db.collection("adminRoles");
const appointmentsCollection = db.collection("appointments");

// GET /api/me/role
export async function getMyRole(req, res, next) {
    try {
        const role = await rolesCollection.findOne({
            userId: String(req.user.id),
            role: "admin",
        });

        res.json({
            role: role ? "admin" : "user",
        });
    } catch (error) {
        next(error);
    }
}

// GET /api/me/summary
export async function getMySummary(req, res, next) {
    try {
        const email = req.user.email;

        const [total, upcoming, byStatus] = await Promise.all([
            appointmentsCollection.countDocuments({
                userEmail: email,
            }),

            appointmentsCollection.countDocuments({
                userEmail: email,
                appointmentDate: {
                    $gte: new Date().toISOString().slice(0, 10),
                },
            }),

            appointmentsCollection
                .aggregate([
                    {
                        $match: {
                            userEmail: email,
                        },
                    },
                    {
                        $group: {
                            _id: {
                                $ifNull: ["$status", "Booked"],
                            },
                            count: { $sum: 1 },
                        },
                    },
                ])
                .toArray(),
        ]);

        res.json({
            total,
            upcoming,
            byStatus,
        });
    } catch (error) {
        next(error);
    }
}

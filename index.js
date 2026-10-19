
import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { toNodeHandler } from "better-auth/node";

import { auth } from "./auth.js";
import { client, db } from "./db.js";
import { escapeRegex } from "./validation.js";

import uploadRoutes from "./upload.js";
import doctorRoutes from "./routes/doctorRoutes.js";
import appointmentRoutes from "./routes/appointmentRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";

import { verifyAuth } from "./middleware/authMiddleware.js";

import {
    errorHandler,
    notFoundHandler,
} from "./middleware/errorMiddleware.js";

const app = express();
const port = process.env.PORT || 5000;

const clientURL = (
    process.env.CLIENT_URL || "http://localhost:3000"
).replace(/\/$/, "");

const allowedOrigins = [
    ...new Set(["http://localhost:3000", clientURL]),
];

// CORS configuration
app.use(
    cors({
        origin(origin, callback) {
            if (!origin || allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            return callback(
                new Error("Not allowed by CORS")
            );
        },
        methods: [
            "GET",
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
            "OPTIONS",
        ],
        credentials: true,
        exposedHeaders: [
            "set-auth-token",
            "set-auth-jwt",
        ],
    })
);

// Better Auth
app.all("/api/auth/*splat", toNodeHandler(auth));

// Request middleware
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());

// Modular API routes
app.use("/api/upload", uploadRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/appointments", appointmentRoutes);
app.use("/api/admin", adminRoutes);

// Home
app.get("/", (req, res) => {
    res.send("DocAppoint Server Running");
});

// Health check
app.get("/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "DocAppoint API is healthy",
    });
});

async function run() {
    try {
        await client.connect();
        console.log("MongoDB Connected Successfully");

        const doctorsCollection = db.collection("doctors");
        const appointmentsCollection = db.collection(
            "appointments"
        );
        const rolesCollection = db.collection("adminRoles");
        const contactCollection = db.collection(
            "contactMessages"
        );

        // GET /api/me/role
        app.get(
            "/api/me/role",
            verifyAuth,
            async (req, res, next) => {
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
        );

        // GET /api/me/summary
        app.get(
            "/api/me/summary",
            verifyAuth,
            async (req, res, next) => {
                try {
                    const email = req.user.email;

                    const [
                        total,
                        upcoming,
                        byStatus,
                    ] = await Promise.all([
                        appointmentsCollection.countDocuments({
                            userEmail: email,
                        }),

                        appointmentsCollection.countDocuments({
                            userEmail: email,
                            appointmentDate: {
                                $gte: new Date()
                                    .toISOString()
                                    .slice(0, 10),
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
                                            $ifNull: [
                                                "$status",
                                                "Booked",
                                            ],
                                        },
                                        count: {
                                            $sum: 1,
                                        },
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
        );

        // Public doctors
        app.get(
            "/doctors",
            async (req, res, next) => {
                try {
                    const search =
                        typeof req.query.search === "string"
                            ? req.query.search
                                .slice(0, 100)
                                .trim()
                            : "";

                    const query = search
                        ? {
                            name: {
                                $regex: escapeRegex(search),
                                $options: "i",
                            },
                        }
                        : {};

                    const doctors = await doctorsCollection
                        .find(query)
                        .toArray();

                    res.json(doctors);
                } catch (error) {
                    next(error);
                }
            }
        );

        // Public statistics
        app.get(
            "/api/stats",
            async (req, res, next) => {
                try {
                    const [
                        doctors,
                        appointments,
                        specialties,
                    ] = await Promise.all([
                        doctorsCollection.countDocuments(),
                        appointmentsCollection.countDocuments(),

                        doctorsCollection
                            .aggregate([
                                {
                                    $match: {
                                        specialty: {
                                            $type: "string",
                                            $ne: "",
                                        },
                                    },
                                },
                                {
                                    $group: {
                                        _id: "$specialty",
                                    },
                                },
                            ])
                            .toArray(),
                    ]);

                    res.json({
                        doctors,
                        appointments,
                        specialties: specialties.length,
                    });
                } catch (error) {
                    next(error);
                }
            }
        );

        // Public contact form
        app.post(
            "/api/contact",
            async (req, res, next) => {
                try {
                    const {
                        name,
                        email,
                        subject,
                        message,
                    } = req.body || {};

                    const validEmail =
                        typeof email === "string" &&
                        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
                        email.length <= 254;

                    if (
                        typeof name !== "string" ||
                        name.trim().length < 2 ||
                        name.length > 100 ||
                        !validEmail ||
                        typeof subject !== "string" ||
                        subject.trim().length < 3 ||
                        subject.length > 150 ||
                        typeof message !== "string" ||
                        message.trim().length < 10 ||
                        message.length > 3000
                    ) {
                        return res.status(400).json({
                            message:
                                "Please provide valid name, email, subject and message.",
                        });
                    }

                    await contactCollection.insertOne({
                        name: name.trim(),
                        email: email.trim().toLowerCase(),
                        subject: subject.trim(),
                        message: message.trim(),
                        createdAt: new Date(),
                        status: "new",
                    });

                    res.status(201).json({
                        message: "Message received successfully.",
                    });
                } catch (error) {
                    next(error);
                }
            }
        );

        // Public doctor details
        app.get(
            "/doctors/:id",
            async (req, res, next) => {
                try {
                    const doctor = await doctorsCollection.findOne({
                        id: req.params.id,
                    });

                    if (!doctor) {
                        return res.status(404).json({
                            message: "Doctor not found",
                        });
                    }

                    res.json(doctor);
                } catch (error) {
                    next(error);
                }
            }
        );

        // Appointment routes:
        // routes/appointmentRoutes.js

        // Admin routes:
        // routes/adminRoutes.js

        // Error handling
        app.use(notFoundHandler);
        app.use(errorHandler);
    } catch (error) {
        console.error("MongoDB connection error:", error);
    }
}

app.listen(port, "0.0.0.0", () => {
    console.log(`Server running on port ${port}`);
});

run();

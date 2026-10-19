
import "dotenv/config";

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { toNodeHandler } from "better-auth/node";

import { auth } from "./auth.js";
import { client } from "./db.js";

// Existing modular routes
import uploadRoutes from "./upload.js";
import doctorRoutes from "./routes/doctorRoutes.js";
import appointmentRoutes from "./routes/appointmentRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";

// New modular routes
import userRoutes from "./routes/userRoutes.js";
import publicRoutes from "./routes/publicRoutes.js";

// Error middleware
import {
    errorHandler,
    notFoundHandler,
} from "./middleware/errorMiddleware.js";

const app = express();

const port = process.env.PORT || 5000;

// Allowed frontend URLs
const clientURL = (
    process.env.CLIENT_URL || "http://localhost:3000"
).replace(/\/$/, "");

const allowedOrigins = [
    ...new Set([
        "http://localhost:3000",
        clientURL,
    ]),
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

// Upload routes
app.use("/api/upload", uploadRoutes);

// Doctor management routes
app.use("/api/doctors", doctorRoutes);

// Appointment routes
app.use("/appointments", appointmentRoutes);

// Admin routes
app.use("/api/admin", adminRoutes);

// User routes
app.use("/api/me", userRoutes);

// Public routes
app.use("/", publicRoutes);

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

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Connect MongoDB and start server
async function run() {
    try {
        await client.connect();

        console.log("MongoDB Connected Successfully");

        app.listen(port, "0.0.0.0", () => {
            console.log(`Server running on port ${port}`);
        });
    } catch (error) {
        console.error("MongoDB connection error:", error);
        process.exitCode = 1;
    }
}

run();

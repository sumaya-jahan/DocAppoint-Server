
import "dotenv/config";

import express from "express";
import crypto from "node:crypto";
import cors from "cors";
import cookieParser from "cookie-parser";
import { ObjectId } from "mongodb";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";

import { auth } from "./auth.js";
import { client, db } from "./db.js";
import { cleanBooking, escapeRegex } from "./validation.js";
import uploadRoutes from "./upload.js";

const app = express();
const port = process.env.PORT || 5000;

const clientURL = (
    process.env.CLIENT_URL || "http://localhost:3000"
).replace(/\/$/, "");

const allowedOrigins = [...new Set([
    "http://localhost:3000",
    clientURL,
])];

app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    exposedHeaders: ["set-auth-token", "set-auth-jwt"],
}));

// Better Auth must be registered before express.json()
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());

// Cloudinary profile-image upload
app.use("/api/upload", uploadRoutes);

app.get("/", (req, res) => {
    res.send("DocAppoint Server Running");
});

app.get("/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "DocAppoint API is healthy",
    });
});

// Authentication middleware
const verifyAuth = async (req, res, next) => {
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
};

async function run() {
    try {
        await client.connect();
        console.log("MongoDB Connected Successfully");

        const doctorsCollection = db.collection("doctors");
        const appointmentsCollection = db.collection("appointments");
        const rolesCollection = db.collection("adminRoles");
        const usersCollection = db.collection("user");
        const contactCollection = db.collection("contactMessages");

        const verifyAdmin = async (req, res, next) => {
            try {
                const role = await rolesCollection.findOne({
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
        };

        // USER ROLE
        app.get("/api/me/role", verifyAuth, async (req, res, next) => {
            try {
                const role = await rolesCollection.findOne({
                    userId: String(req.user.id),
                    role: "admin",
                });

                res.json({ role: role ? "admin" : "user" });
            } catch (error) {
                next(error);
            }
        });

        // USER DASHBOARD STATISTICS
        app.get("/api/me/summary", verifyAuth, async (req, res, next) => {
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
                    appointmentsCollection.aggregate([
                        { $match: { userEmail: email } },
                        {
                            $group: {
                                _id: { $ifNull: ["$status", "Booked"] },
                                count: { $sum: 1 },
                            },
                        },
                    ]).toArray(),
                ]);

                res.json({ total, upcoming, byStatus });
            } catch (error) {
                next(error);
            }
        });

        // ADMIN OVERVIEW
        app.get(
            "/api/admin/overview",
            verifyAuth,
            verifyAdmin,
            async (req, res, next) => {
                try {
                    const [
                        doctors,
                        appointments,
                        users,
                        contacts,
                        bySpecialty,
                        byMonth,
                        byStatus,
                    ] = await Promise.all([
                        doctorsCollection.countDocuments(),
                        appointmentsCollection.countDocuments(),
                        usersCollection.countDocuments(),
                        contactCollection.countDocuments(),
                        doctorsCollection.aggregate([
                            {
                                $group: {
                                    _id: { $ifNull: ["$specialty", "Unspecified"] },
                                    count: { $sum: 1 },
                                },
                            },
                            { $sort: { count: -1 } },
                            { $limit: 12 },
                        ]).toArray(),
                        appointmentsCollection.aggregate([
                            {
                                $match: {
                                    appointmentDate: { $type: "string" },
                                },
                            },
                            {
                                $group: {
                                    _id: {
                                        $substrBytes: ["$appointmentDate", 0, 7],
                                    },
                                    count: { $sum: 1 },
                                },
                            },
                            { $sort: { _id: 1 } },
                            { $limit: 24 },
                        ]).toArray(),
                        appointmentsCollection.aggregate([
                            {
                                $group: {
                                    _id: { $ifNull: ["$status", "Booked"] },
                                    count: { $sum: 1 },
                                },
                            },
                        ]).toArray(),
                    ]);

                    res.json({
                        doctors,
                        appointments,
                        users,
                        contacts,
                        bySpecialty,
                        byMonth,
                        byStatus,
                    });
                } catch (error) {
                    next(error);
                }
            }
        );

        // DOCTOR VALIDATION
        const doctorFields = [
            "name", "specialty", "location", "fee",
            "rating", "image", "experience",
            "description", "qualification", "availability",
        ];

        function validateDoctor(body, partial = false) {
            if (!body || typeof body !== "object" || Array.isArray(body)) {
                return { error: "Invalid doctor data" };
            }

            const value = {};

            for (const key of Object.keys(body)) {
                if (!doctorFields.includes(key)) {
                    return { error: `Unexpected field: ${key}` };
                }
                value[key] = body[key];
            }

            for (const key of ["name", "specialty", "location"]) {
                if (!partial || key in value) {
                    if (
                        typeof value[key] !== "string" ||
                        value[key].trim().length < 2 ||
                        value[key].length > 120
                    ) {
                        return { error: `Invalid ${key}` };
                    }
                    value[key] = value[key].trim();
                }
            }

            for (const key of ["fee", "rating", "experience"]) {
                if (key in value) {
                    const number = Number(value[key]);
                    if (
                        !Number.isFinite(number) ||
                        number < 0 ||
                        (key === "rating" && number > 5)
                    ) {
                        return { error: `Invalid ${key}` };
                    }
                    value[key] = number;
                }
            }

            for (const key of [
                "image", "description", "qualification", "availability",
            ]) {
                if (
                    key in value &&
                    (typeof value[key] !== "string" || value[key].length > 2000)
                ) {
                    return { error: `Invalid ${key}` };
                }
            }

            if (
                value.image &&
                !/^https:\/\//.test(value.image)
            ) {
                return { error: "Image must use HTTPS" };
            }

            if (!partial) value.id = crypto.randomUUID();

            if (partial && !Object.keys(value).length) {
                return { error: "No changes provided" };
            }

            return { value };
        }

        // ADMIN DOCTOR LIST
        app.get(
            "/api/admin/doctors",
            verifyAuth,
            verifyAdmin,
            async (req, res, next) => {
                try {
                    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
                    const limit = 10;
                    const search = String(req.query.search || "").slice(0, 80);

                    const query = search
                        ? { name: { $regex: escapeRegex(search), $options: "i" } }
                        : {};

                    const [items, total] = await Promise.all([
                        doctorsCollection.find(query)
                            .sort({ name: 1 })
                            .skip((page - 1) * limit)
                            .limit(limit)
                            .toArray(),
                        doctorsCollection.countDocuments(query),
                    ]);

                    res.json({
                        items,
                        total,
                        page,
                        pages: Math.ceil(total / limit),
                    });
                } catch (error) {
                    next(error);
                }
            }
        );

        // ADD DOCTOR
        app.post(
            "/api/admin/doctors",
            verifyAuth,
            verifyAdmin,
            async (req, res, next) => {
                try {
                    const checked = validateDoctor(req.body);

                    if (checked.error) {
                        return res.status(400).json({
                            message: checked.error,
                        });
                    }

                    await doctorsCollection.insertOne(checked.value);
                    res.status(201).json(checked.value);
                } catch (error) {
                    next(error);
                }
            }
        );

        // EDIT DOCTOR
        app.patch(
            "/api/admin/doctors/:id",
            verifyAuth,
            verifyAdmin,
            async (req, res, next) => {
                try {
                    const checked = validateDoctor(req.body, true);

                    if (checked.error) {
                        return res.status(400).json({
                            message: checked.error,
                        });
                    }

                    const result = await doctorsCollection.updateOne(
                        { id: req.params.id },
                        { $set: checked.value }
                    );

                    if (!result.matchedCount) {
                        return res.status(404).json({
                            message: "Doctor not found",
                        });
                    }

                    res.json({ message: "Doctor updated" });
                } catch (error) {
                    next(error);
                }
            }
        );

        // DELETE DOCTOR
        app.delete(
            "/api/admin/doctors/:id",
            verifyAuth,
            verifyAdmin,
            async (req, res, next) => {
                try {
                    const result = await doctorsCollection.deleteOne({
                        id: req.params.id,
                    });

                    if (!result.deletedCount) {
                        return res.status(404).json({
                            message: "Doctor not found",
                        });
                    }

                    res.json({ message: "Doctor deleted" });
                } catch (error) {
                    next(error);
                }
            }
        );

        // ADMIN USERS
        app.get(
            "/api/admin/users",
            verifyAuth,
            verifyAdmin,
            async (req, res, next) => {
                try {
                    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
                    const limit = 10;

                    const [items, total] = await Promise.all([
                        usersCollection.find({}, {
                            projection: {
                                name: 1,
                                email: 1,
                                image: 1,
                                emailVerified: 1,
                                createdAt: 1,
                            },
                        })
                            .sort({ createdAt: -1 })
                            .skip((page - 1) * limit)
                            .limit(limit)
                            .toArray(),
                        usersCollection.countDocuments(),
                    ]);

                    res.json({
                        items,
                        total,
                        page,
                        pages: Math.ceil(total / limit),
                    });
                } catch (error) {
                    next(error);
                }
            }
        );

        // ADMIN CONTACT MESSAGES
        app.get(
            "/api/admin/contacts",
            verifyAuth,
            verifyAdmin,
            async (req, res, next) => {
                try {
                    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
                    const limit = 10;

                    const [items, total] = await Promise.all([
                        contactCollection.find({})
                            .sort({ createdAt: -1 })
                            .skip((page - 1) * limit)
                            .limit(limit)
                            .toArray(),
                        contactCollection.countDocuments(),
                    ]);

                    res.json({
                        items,
                        total,
                        page,
                        pages: Math.ceil(total / limit),
                    });
                } catch (error) {
                    next(error);
                }
            }
        );

        // ALL DOCTORS
        app.get("/doctors", async (req, res, next) => {
            try {
                const search = typeof req.query.search === "string"
                    ? req.query.search.slice(0, 100).trim()
                    : "";

                const query = search
                    ? { name: { $regex: escapeRegex(search), $options: "i" } }
                    : {};

                const doctors = await doctorsCollection.find(query).toArray();
                res.json(doctors);
            } catch (error) {
                next(error);
            }
        });

        // SEARCH, FILTER, SORT AND PAGINATE
        app.get("/api/doctors", async (req, res, next) => {
            try {
                const page = Math.max(
                    1,
                    Math.min(100000, parseInt(req.query.page, 10) || 1)
                );

                const limit = Math.max(
                    1,
                    Math.min(40, parseInt(req.query.limit, 10) || 8)
                );

                const search = String(req.query.search || "").trim().slice(0, 100);
                const specialty = String(req.query.specialty || "").trim().slice(0, 80);
                const location = String(req.query.location || "").trim().slice(0, 80);
                const sort = String(req.query.sort || "rating");

                const query = {};

                if (search) {
                    query.name = {
                        $regex: escapeRegex(search),
                        $options: "i",
                    };
                }

                if (specialty) {
                    query.specialty = {
                        $regex: escapeRegex(specialty),
                        $options: "i",
                    };
                }

                if (location) {
                    query.location = {
                        $regex: escapeRegex(location),
                        $options: "i",
                    };
                }

                const sortMap = {
                    rating: { rating: -1 },
                    feeLow: { fee: 1 },
                    feeHigh: { fee: -1 },
                    name: { name: 1 },
                };

                const [total, items] = await Promise.all([
                    doctorsCollection.countDocuments(query),
                    doctorsCollection.find(query)
                        .sort(sortMap[sort] || sortMap.rating)
                        .skip((page - 1) * limit)
                        .limit(limit)
                        .toArray(),
                ]);

                res.json({
                    items,
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit),
                });
            } catch (error) {
                next(error);
            }
        });

        // PUBLIC STATISTICS
        app.get("/api/stats", async (req, res, next) => {
            try {
                const [doctors, appointments, specialties] = await Promise.all([
                    doctorsCollection.countDocuments(),
                    appointmentsCollection.countDocuments(),
                    doctorsCollection.distinct("specialty"),
                ]);

                res.json({
                    doctors,
                    appointments,
                    specialties: specialties.filter(Boolean).length,
                });
            } catch (error) {
                next(error);
            }
        });

        // CONTACT FORM
        app.post("/api/contact", async (req, res, next) => {
            try {
                const { name, email, subject, message } = req.body || {};

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
                        message: "Please provide valid name, email, subject and message.",
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
        });

        // SINGLE DOCTOR
        app.get("/doctors/:id", async (req, res, next) => {
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
        });

        // USER APPOINTMENTS
        app.get("/appointments", verifyAuth, async (req, res, next) => {
            try {
                const email = req.query.email;

                if (!email) {
                    return res.status(400).json({
                        message: "Email is required",
                    });
                }

                if (req.user.email !== email) {
                    return res.status(403).json({
                        message: "Forbidden Access",
                    });
                }

                const bookings = await appointmentsCollection.find({
                    userEmail: email,
                }).toArray();

                res.json(bookings);
            } catch (error) {
                next(error);
            }
        });

        // CREATE APPOINTMENT
        app.post("/appointments", verifyAuth, async (req, res, next) => {
            try {
                const checked = cleanBooking(req.body, {
                    create: true,
                    email: req.user.email,
                });

                if (checked.error) {
                    return res.status(checked.status || 400).json({
                        message: checked.error,
                    });
                }

                const result = await appointmentsCollection.insertOne(
                    checked.value
                );

                res.status(201).json(result);
            } catch (error) {
                next(error);
            }
        });

        // UPDATE APPOINTMENT
        app.put("/appointments/:id", verifyAuth, async (req, res, next) => {
            try {
                const id = req.params.id;

                if (!ObjectId.isValid(id)) {
                    return res.status(400).json({
                        message: "Invalid appointment ID",
                    });
                }

                const existing = await appointmentsCollection.findOne({
                    _id: new ObjectId(id),
                });

                if (!existing) {
                    return res.status(404).json({
                        message: "Appointment not found",
                    });
                }

                if (existing.userEmail !== req.user.email) {
                    return res.status(403).json({
                        message: "Forbidden Access",
                    });
                }

                const checked = cleanBooking(req.body);

                if (checked.error) {
                    return res.status(400).json({
                        message: checked.error,
                    });
                }

                const result = await appointmentsCollection.updateOne(
                    {
                        _id: new ObjectId(id),
                        userEmail: req.user.email,
                    },
                    { $set: checked.value }
                );

                res.json(result);
            } catch (error) {
                next(error);
            }
        });

        // DELETE APPOINTMENT
        app.delete("/appointments/:id", verifyAuth, async (req, res, next) => {
            try {
                const id = req.params.id;

                if (!ObjectId.isValid(id)) {
                    return res.status(400).json({
                        message: "Invalid appointment ID",
                    });
                }

                const existing = await appointmentsCollection.findOne({
                    _id: new ObjectId(id),
                });

                if (!existing) {
                    return res.status(404).json({
                        message: "Appointment not found",
                    });
                }

                if (existing.userEmail !== req.user.email) {
                    return res.status(403).json({
                        message: "Forbidden Access",
                    });
                }

                const result = await appointmentsCollection.deleteOne({
                    _id: new ObjectId(id),
                    userEmail: req.user.email,
                });

                res.json(result);
            } catch (error) {
                next(error);
            }
        });

        // CENTRALIZED ERROR HANDLER
        app.use((error, req, res, next) => {
            if (res.headersSent) return next(error);

            res.status(error.statusCode || 500).json({
                message:
                    error.statusCode && error.statusCode < 500
                        ? error.message
                        : "Internal server error",
            });
        });

        // API 404
        app.use((req, res) => {
            res.status(404).json({
                success: false,
                message: "API route not found",
            });
        });

        app.listen(port, () => {
            console.log(`Server running on port ${port}`);
        });
    } catch (error) {
        console.error("MongoDB connection error:", error);
    }
}

run();

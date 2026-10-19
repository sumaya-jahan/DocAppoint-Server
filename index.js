
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

import doctorRoutes from "./routes/doctorRoutes.js";
import { verifyAuth, verifyAdmin } from "./middleware/authMiddleware.js";


const app = express();
const port = process.env.PORT || 5000;

const clientURL = (
    process.env.CLIENT_URL || "http://localhost:3000"
).replace(/\/$/, "");

const allowedOrigins = [
    ...new Set(["http://localhost:3000", clientURL]),
];

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

app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());
app.use("/api/upload", uploadRoutes);
app.use("/api/doctors", doctorRoutes);

app.get("/", (req, res) => {
    res.send("DocAppoint Server Running");
});

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
        const appointmentsCollection = db.collection("appointments");
        const rolesCollection = db.collection("adminRoles");
        const usersCollection = db.collection("user");
        const contactCollection = db.collection("contactMessages");

        

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

        // Doctor validation including multiple images
        const doctorFields = [
            "name",
            "specialty",
            "location",
            "fee",
            "rating",
            "image",
            "images",
            "experience",
            "description",
            "qualification",
            "availability",
        ];

        function validateDoctor(body, partial = false) {
            if (
                !body ||
                typeof body !== "object" ||
                Array.isArray(body)
            ) {
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
                "image",
                "description",
                "qualification",
                "availability",
            ]) {
                if (
                    key in value &&
                    (
                        typeof value[key] !== "string" ||
                        value[key].length > 2000
                    )
                ) {
                    return { error: `Invalid ${key}` };
                }
            }

            if (value.image && !/^https:\/\//.test(value.image)) {
                return { error: "Image must use HTTPS" };
            }

            // Multiple image gallery validation
            if ("images" in value) {
                if (
                    !Array.isArray(value.images) ||
                    value.images.length > 10 ||
                    value.images.some(
                        (url) =>
                            typeof url !== "string" ||
                            url.length > 2000 ||
                            !/^https:\/\//.test(url)
                    )
                ) {
                    return {
                        error: "Images must be an array of up to 10 HTTPS URLs",
                    };
                }

                value.images = [...new Set(value.images)];
            }

            if (!partial) {
                value.id = crypto.randomUUID();
            }

            if (partial && !Object.keys(value).length) {
                return { error: "No changes provided" };
            }

            return { value };
        }

        app.get(
            "/api/admin/doctors",
            verifyAuth,
            verifyAdmin,
            async (req, res, next) => {
                try {
                    const page = Math.max(
                        1,
                        parseInt(req.query.page, 10) || 1
                    );
                    const limit = 10;
                    const search = String(req.query.search || "").slice(0, 80);

                    const query = search
                        ? {
                            name: {
                                $regex: escapeRegex(search),
                                $options: "i",
                            },
                        }
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

        app.get(
            "/api/admin/users",
            verifyAuth,
            verifyAdmin,
            async (req, res, next) => {
                try {
                    const page = Math.max(
                        1,
                        parseInt(req.query.page, 10) || 1
                    );
                    const limit = 10;

                    const [items, total] = await Promise.all([
                        usersCollection.find(
                            {},
                            {
                                projection: {
                                    name: 1,
                                    email: 1,
                                    image: 1,
                                    emailVerified: 1,
                                    createdAt: 1,
                                },
                            }
                        )
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

        app.get(
            "/api/admin/contacts",
            verifyAuth,
            verifyAdmin,
            async (req, res, next) => {
                try {
                    const page = Math.max(
                        1,
                        parseInt(req.query.page, 10) || 1
                    );
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

        app.get("/doctors", async (req, res, next) => {
            try {
                const search =
                    typeof req.query.search === "string"
                        ? req.query.search.slice(0, 100).trim()
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
        });

// Public statistics
        app.get("/api/stats", async (req, res, next) => {
            try {
                const [doctors, appointments, specialties] =
                    await Promise.all([
                        doctorsCollection.countDocuments(),
                        appointmentsCollection.countDocuments(),
                        doctorsCollection.aggregate([
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
                        ]).toArray(),
                    ]);

                res.json({
                    doctors,
                    appointments,
                    specialties: specialties.length,
                });
            } catch (error) {
                next(error);
            }
        });

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
        });

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

        app.delete(
            "/appointments/:id",
            verifyAuth,
            async (req, res, next) => {
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
            }
        );

        app.use((error, req, res, next) => {
            if (res.headersSent) return next(error);

            console.error("API error:", error.message);

            res.status(error.statusCode || 500).json({
                message:
                    error.statusCode && error.statusCode < 500
                        ? error.message
                        : "Internal server error",
            });
        });

        app.use((req, res) => {
            res.status(404).json({
                success: false,
                message: "API route not found",
            });
        });
    } catch (error) {
        console.error("MongoDB connection error:", error);
    }
}

app.listen(port, "0.0.0.0", () => {
    console.log(`Server running on port ${port}`);
});

run();



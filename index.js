import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { ObjectId } from "mongodb";

import {
    toNodeHandler,
    fromNodeHeaders,
} from "better-auth/node";

import { auth } from "./auth.js";
import { client, db } from "./db.js";

const app = express();
const port = process.env.PORT || 5000;

// ==========================================
// CORS
// ==========================================
app.use(
    cors({
        origin: [
            "http://localhost:3000",
            "https://doc-appoint-client-three.vercel.app",
        ],
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

// ==========================================
// BETTER AUTH
// IMPORTANT:
// Express 5 uses *splat
// This must be BEFORE express.json()
// ==========================================
app.all(
    "/api/auth/*splat",
    toNodeHandler(auth)
);

// ==========================================
// NORMAL MIDDLEWARE
// ==========================================
app.use(express.json());
app.use(cookieParser());

// ==========================================
// ROOT ROUTE
// ==========================================
app.get("/", (req, res) => {
    res.send("DocAppoint Server Running");
});

// ==========================================
// HEALTH CHECK
// ==========================================
app.get("/health", (req, res) => {
    res.status(200).send({
        success: true,
        message: "DocAppoint API is healthy",
    });
});

// ==========================================
// BETTER AUTH SESSION VERIFY MIDDLEWARE
// ==========================================
const verifyAuth = async (req, res, next) => {
    try {
        const session =
            await auth.api.getSession({
                headers: fromNodeHeaders(
                    req.headers
                ),
            });

        if (!session?.user?.email) {
            return res.status(401).send({
                message: "Unauthorized",
            });
        }

        req.user = session.user;
        req.session = session.session;

        next();
    } catch (error) {
        console.error(
            "Authentication error:",
            error
        );

        return res.status(401).send({
            message: "Unauthorized",
        });
    }
};

// ==========================================
// START DATABASE + ROUTES
// ==========================================
async function run() {
    try {
        await client.connect();

        console.log(
            "MongoDB Connected Successfully"
        );

        const doctorsCollection =
            db.collection("doctors");

        const appointmentsCollection =
            db.collection("appointments");

        // ==================================
        // GET ALL DOCTORS + SEARCH
        // ==================================
        app.get(
            "/doctors",
            async (req, res) => {
                try {
                    const search =
                        req.query.search || "";

                    const query = search
                        ? {
                            name: {
                                $regex: search,
                                $options: "i",
                            },
                        }
                        : {};

                    const result =
                        await doctorsCollection
                            .find(query)
                            .toArray();

                    res.send(result);
                } catch (error) {
                    console.error(error);

                    res.status(500).send({
                        message:
                            "Failed to fetch doctors",
                    });
                }
            }
        );

        // ==================================
        // GET SINGLE DOCTOR
        // ==================================
        app.get(
            "/doctors/:id",
            async (req, res) => {
                try {
                    const id = req.params.id;

                    const doctor =
                        await doctorsCollection.findOne(
                            {
                                id: id,
                            }
                        );

                    if (!doctor) {
                        return res
                            .status(404)
                            .send({
                                message:
                                    "Doctor not found",
                            });
                    }

                    res.send(doctor);
                } catch (error) {
                    console.error(error);

                    res.status(500).send({
                        message:
                            "Failed to fetch doctor",
                    });
                }
            }
        );

        // ==================================
        // GET CURRENT USER APPOINTMENTS
        // PRIVATE
        // ==================================
        app.get(
            "/appointments",
            verifyAuth,
            async (req, res) => {
                try {
                    const email =
                        req.query.email;

                    if (!email) {
                        return res
                            .status(400)
                            .send({
                                message:
                                    "Email is required",
                            });
                    }

                    if (
                        req.user.email !== email
                    ) {
                        return res
                            .status(403)
                            .send({
                                message:
                                    "Forbidden Access",
                            });
                    }

                    const result =
                        await appointmentsCollection
                            .find({
                                userEmail:
                                    email,
                            })
                            .toArray();

                    res.send(result);
                } catch (error) {
                    console.error(error);

                    res.status(500).send({
                        message:
                            "Failed to fetch appointments",
                    });
                }
            }
        );

        // ==================================
        // SAVE APPOINTMENT
        // PRIVATE
        // ==================================
        app.post(
            "/appointments",
            verifyAuth,
            async (req, res) => {
                try {
                    const booking =
                        req.body;

                    if (
                        !booking.userEmail ||
                        !booking.doctorName ||
                        !booking.patientName ||
                        !booking.phone ||
                        !booking.appointmentDate ||
                        !booking.appointmentTime
                    ) {
                        return res
                            .status(400)
                            .send({
                                message:
                                    "Required appointment information is missing",
                            });
                    }

                    if (
                        req.user.email !==
                        booking.userEmail
                    ) {
                        return res
                            .status(403)
                            .send({
                                message:
                                    "Forbidden Access",
                            });
                    }

                    const result =
                        await appointmentsCollection.insertOne(
                            booking
                        );

                    res.send(result);
                } catch (error) {
                    console.error(error);

                    res.status(500).send({
                        message:
                            "Failed to book appointment",
                    });
                }
            }
        );

        // ==================================
        // UPDATE APPOINTMENT
        // PRIVATE
        // ==================================
        app.put(
            "/appointments/:id",
            verifyAuth,
            async (req, res) => {
                try {
                    const id =
                        req.params.id;

                    if (
                        !ObjectId.isValid(id)
                    ) {
                        return res
                            .status(400)
                            .send({
                                message:
                                    "Invalid appointment ID",
                            });
                    }

                    const existingBooking =
                        await appointmentsCollection.findOne(
                            {
                                _id: new ObjectId(
                                    id
                                ),
                            }
                        );

                    if (!existingBooking) {
                        return res
                            .status(404)
                            .send({
                                message:
                                    "Appointment not found",
                            });
                    }

                    if (
                        existingBooking.userEmail !==
                        req.user.email
                    ) {
                        return res
                            .status(403)
                            .send({
                                message:
                                    "Forbidden Access",
                            });
                    }

                    const updatedBooking =
                        req.body;

                    const updatedDoc = {
                        $set: {
                            patientName:
                                updatedBooking.patientName,
                            gender:
                                updatedBooking.gender,
                            phone:
                                updatedBooking.phone,
                            appointmentDate:
                                updatedBooking.appointmentDate,
                            appointmentTime:
                                updatedBooking.appointmentTime,
                        },
                    };

                    const result =
                        await appointmentsCollection.updateOne(
                            {
                                _id: new ObjectId(
                                    id
                                ),
                            },
                            updatedDoc
                        );

                    res.send(result);
                } catch (error) {
                    console.error(error);

                    res.status(500).send({
                        message:
                            "Failed to update appointment",
                    });
                }
            }
        );

        // ==================================
        // DELETE APPOINTMENT
        // PRIVATE
        // ==================================
        app.delete(
            "/appointments/:id",
            verifyAuth,
            async (req, res) => {
                try {
                    const id =
                        req.params.id;

                    if (
                        !ObjectId.isValid(id)
                    ) {
                        return res
                            .status(400)
                            .send({
                                message:
                                    "Invalid appointment ID",
                            });
                    }

                    const existingBooking =
                        await appointmentsCollection.findOne(
                            {
                                _id: new ObjectId(
                                    id
                                ),
                            }
                        );

                    if (!existingBooking) {
                        return res
                            .status(404)
                            .send({
                                message:
                                    "Appointment not found",
                            });
                    }

                    if (
                        existingBooking.userEmail !==
                        req.user.email
                    ) {
                        return res
                            .status(403)
                            .send({
                                message:
                                    "Forbidden Access",
                            });
                    }

                    const result =
                        await appointmentsCollection.deleteOne(
                            {
                                _id: new ObjectId(
                                    id
                                ),
                            }
                        );

                    res.send(result);
                } catch (error) {
                    console.error(error);

                    res.status(500).send({
                        message:
                            "Failed to delete appointment",
                    });
                }
            }
        );

        // ==================================
        // API 404
        // ==================================
        app.use((req, res) => {
            res.status(404).send({
                success: false,
                message:
                    "API route not found",
            });
        });

        // ==================================
        // START SERVER
        // ==================================
        app.listen(port, () => {
            console.log(
                `Server running on port ${port}`
            );
        });
    } catch (error) {
        console.error(
            "MongoDB connection error:",
            error
        );
    }
}

run();
const express = require("express");
console.log("THIS IS MY SERVER");

const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");

const {
    MongoClient,
    ServerApiVersion,
    ObjectId,
} = require("mongodb");

require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(
    cors({
        origin: [
            "http://localhost:5173",
            "https://doc-appoint-client-three.vercel.app",
        ],
        credentials: true,
    })
);

app.use(express.json());
app.use(cookieParser());

// MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.8eggrxa.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

// =========================
// JWT Generate
// =========================
app.post("/jwt", (req, res) => {
    const user = req.body;

    if (!user?.email) {
        return res.status(400).send({
            message: "User email is required",
        });
    }

    const token = jwt.sign(
        { email: user.email },
        process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn: "7d",
        }
    );

    res.send({ token });
});

// =========================
// Verify Token Middleware
// =========================
const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).send({
            message: "Unauthorized",
        });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).send({
            message: "Unauthorized",
        });
    }

    jwt.verify(
        token,
        process.env.ACCESS_TOKEN_SECRET,
        (err, decoded) => {
            if (err) {
                return res.status(403).send({
                    message: "Forbidden",
                });
            }

            req.decoded = decoded;
            next();
        }
    );
};

// =========================
// MongoDB
// =========================
async function run() {
    try {
        await client.connect();

        console.log("✅ MongoDB Connected Successfully");

        const database = client.db("docappointDB");

        const doctorsCollection =
            database.collection("doctors");

        const appointmentsCollection =
            database.collection("appointments");

        // =========================
        // GET ALL DOCTORS + SEARCH
        // =========================
        app.get("/doctors", async (req, res) => {
            try {
                const search = req.query.search || "";

                const query = search
                    ? {
                        name: {
                            $regex: search,
                            $options: "i",
                        },
                    }
                    : {};

                const result = await doctorsCollection
                    .find(query)
                    .toArray();

                res.send(result);
            } catch (error) {
                console.error(error);

                res.status(500).send({
                    message: "Failed to fetch doctors",
                });
            }
        });

        // =========================
        // GET SINGLE DOCTOR
        // =========================
        app.get("/doctors/:id", async (req, res) => {
            try {
                const id = req.params.id;

                const doctor =
                    await doctorsCollection.findOne({
                        id: id,
                    });

                if (!doctor) {
                    return res.status(404).send({
                        message: "Doctor not found",
                    });
                }

                res.send(doctor);
            } catch (error) {
                console.error(error);

                res.status(500).send({
                    message: "Failed to fetch doctor",
                });
            }
        });

        // =========================
        // GET USER APPOINTMENTS
        // Protected
        // =========================
        app.get(
            "/appointments",
            verifyToken,
            async (req, res) => {
                try {
                    const email = req.query.email;

                    if (!email) {
                        return res.status(400).send({
                            message: "Email is required",
                        });
                    }

                    if (req.decoded.email !== email) {
                        return res.status(403).send({
                            message: "Forbidden Access",
                        });
                    }

                    const result =
                        await appointmentsCollection
                            .find({
                                userEmail: email,
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

        // =========================
        // SAVE APPOINTMENT
        // Protected
        // =========================
        app.post(
            "/appointments",
            verifyToken,
            async (req, res) => {
                try {
                    const booking = req.body;

                    if (
                        !booking.userEmail ||
                        !booking.doctorName ||
                        !booking.patientName ||
                        !booking.phone ||
                        !booking.appointmentDate ||
                        !booking.appointmentTime
                    ) {
                        return res.status(400).send({
                            message:
                                "Required appointment information is missing",
                        });
                    }

                    if (
                        req.decoded.email !==
                        booking.userEmail
                    ) {
                        return res.status(403).send({
                            message: "Forbidden Access",
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

        // =========================
        // UPDATE APPOINTMENT
        // Protected
        // =========================
        app.put(
            "/appointments/:id",
            verifyToken,
            async (req, res) => {
                try {
                    const id = req.params.id;

                    if (!ObjectId.isValid(id)) {
                        return res.status(400).send({
                            message:
                                "Invalid appointment ID",
                        });
                    }

                    const existingBooking =
                        await appointmentsCollection.findOne({
                            _id: new ObjectId(id),
                        });

                    if (!existingBooking) {
                        return res.status(404).send({
                            message:
                                "Appointment not found",
                        });
                    }

                    if (
                        existingBooking.userEmail !==
                        req.decoded.email
                    ) {
                        return res.status(403).send({
                            message: "Forbidden Access",
                        });
                    }

                    const updatedBooking = req.body;

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
                                _id: new ObjectId(id),
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

        // =========================
        // DELETE APPOINTMENT
        // Protected
        // =========================
        app.delete(
            "/appointments/:id",
            verifyToken,
            async (req, res) => {
                try {
                    const id = req.params.id;

                    if (!ObjectId.isValid(id)) {
                        return res.status(400).send({
                            message:
                                "Invalid appointment ID",
                        });
                    }

                    const existingBooking =
                        await appointmentsCollection.findOne({
                            _id: new ObjectId(id),
                        });

                    if (!existingBooking) {
                        return res.status(404).send({
                            message:
                                "Appointment not found",
                        });
                    }

                    if (
                        existingBooking.userEmail !==
                        req.decoded.email
                    ) {
                        return res.status(403).send({
                            message: "Forbidden Access",
                        });
                    }

                    const result =
                        await appointmentsCollection.deleteOne({
                            _id: new ObjectId(id),
                        });

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
    } catch (error) {
        console.error("MongoDB connection error:", error);
    }
}

run().catch(console.dir);

// Root Route
app.get("/", (req, res) => {
    res.send("DocAppoint Server Running");
});

// Start Server
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});
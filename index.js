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

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.8eggrxa.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

// JWT Generate
app.post("/jwt", (req, res) => {
    const user = req.body;

    const token = jwt.sign(
        user,
        process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn: "7d",
        }
    );

    res.send({ token });
});

// Verify Token Middleware
const verifyToken = (req, res, next) => {
    const authHeader =
        req.headers.authorization;

    if (!authHeader) {
        return res
            .status(401)
            .send({ message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];

    jwt.verify(
        token,
        process.env.ACCESS_TOKEN_SECRET,
        (err, decoded) => {
            if (err) {
                return res
                    .status(403)
                    .send({
                        message: "Forbidden",
                    });
            }

            req.decoded = decoded;
            next();
        }
    );
};

async function run() {
    try {
        await client.connect();

        console.log(
            "✅ MongoDB Connected Successfully"
        );

        const database =
            client.db("docappointDB");

        const doctorsCollection =
            database.collection("doctors");

        const appointmentsCollection =
            database.collection(
                "appointments"
            );
        // Get all doctors
        app.get("/doctors", async (req, res) => {
            const result = await doctorsCollection.find().toArray();
            res.send(result);
        });

        // Get single doctor
        app.get("/doctors/:id", async (req, res) => {
            const id = req.params.id;

            const doctor = await doctorsCollection.findOne({ id });

            if (!doctor) {
                return res.status(404).send({
                    message: "Doctor not found",
                });
            }

            res.send(doctor);
        });

        // Get appointments by user email (Protected)
        app.get("/appointments", verifyToken, async (req, res) => {
            const email = req.query.email;

            if (req.decoded.email !== email) {
                return res.status(403).send({
                    message: "Forbidden Access",
                });
            }

            const result = await appointmentsCollection
                .find({ userEmail: email })
                .toArray();

            res.send(result);
        });

        // Save appointment
        app.post("/appointments", async (req, res) => {
            const booking = req.body;

            const result =
                await appointmentsCollection.insertOne(booking);

            res.send(result);
        });

        // Update appointment
        app.put("/appointments/:id", async (req, res) => {
            const id = req.params.id;
            const updatedBooking = req.body;

            const query = {
                _id: new ObjectId(id),
            };

            const updatedDoc = {
                $set: {
                    patientName: updatedBooking.patientName,
                    gender: updatedBooking.gender,
                    phone: updatedBooking.phone,
                    appointmentDate:
                        updatedBooking.appointmentDate,
                    appointmentTime:
                        updatedBooking.appointmentTime,
                },
            };

            const result =
                await appointmentsCollection.updateOne(
                    query,
                    updatedDoc
                );

            res.send(result);
        });

        // Delete appointment
        app.delete("/appointments/:id", async (req, res) => {
            const id = req.params.id;

            const result =
                await appointmentsCollection.deleteOne({
                    _id: new ObjectId(id),
                });

            res.send(result);
        });
    } catch (error) {
        console.log(error);
    }
}

run().catch(console.dir);

app.get("/", (req, res) => {
    res.send("DocAppoint Server Running");
});

app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});
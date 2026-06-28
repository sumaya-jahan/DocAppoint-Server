const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion } = require("mongodb");

require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
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

async function run() {
    try {
        await client.connect();

        console.log("✅ MongoDB Connected Successfully");

        const database = client.db("docappointDB");

        const doctorsCollection = database.collection("doctors");

        const appointmentsCollection = database.collection("appointments");

        // Get all doctors
        app.get("/doctors", async (req, res) => {
            const result = await doctorsCollection.find().toArray();
            res.send(result);
        });

        // Get single doctor by id
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
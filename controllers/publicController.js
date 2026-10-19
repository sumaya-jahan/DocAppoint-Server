
import { db } from "../db.js";
import { escapeRegex } from "../validation.js";

const doctorsCollection = db.collection("doctors");
const appointmentsCollection = db.collection("appointments");
const contactCollection = db.collection("contactMessages");

// GET /doctors
export async function getPublicDoctors(req, res, next) {
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
}

// GET /doctors/:id
export async function getPublicDoctorById(req, res, next) {
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

// GET /api/stats
export async function getPublicStats(req, res, next) {
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

// POST /api/contact
export async function createContactMessage(req, res, next) {
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

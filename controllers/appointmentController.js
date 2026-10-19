
import { ObjectId } from "mongodb";
import { db } from "../db.js";
import { cleanBooking } from "../validation.js";

const appointmentsCollection = db.collection("appointments");
const doctorsCollection = db.collection("doctors");

// GET /appointments
export async function getAppointments(req, res, next) {
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

        const bookings = await appointmentsCollection
            .find({
                userEmail: req.user.email,
            })
            .toArray();

        res.json(bookings);
    } catch (error) {
        next(error);
    }
}

// POST /appointments
export async function createAppointment(req, res, next) {
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

        const booking = checked.value;

        let doctor;

        // Find doctor using public doctor ID.
        if (booking.doctorId) {
            doctor = await doctorsCollection.findOne({
                id: booking.doctorId,
            });
        } else {
            // Support older forms without doctorId.
            const matches = await doctorsCollection
                .find({
                    name: booking.doctorName,
                })
                .limit(2)
                .toArray();

            if (matches.length > 1) {
                return res.status(400).json({
                    message:
                        "Multiple doctors have this name. Please select a doctor again.",
                });
            }

            doctor = matches[0];
        }

        if (!doctor) {
            return res.status(400).json({
                message: "Selected doctor does not exist",
            });
        }

        // Always use doctor information from MongoDB.
        booking.doctorId = doctor.id;
        booking.doctorName = doctor.name;

        if (
            typeof doctor.fee === "number" &&
            Number.isFinite(doctor.fee) &&
            doctor.fee >= 0
        ) {
            booking.doctorFee = doctor.fee;
        }

        // Always use authenticated user's email.
        booking.userEmail = req.user.email;

        const result = await appointmentsCollection.insertOne(
            booking
        );

        res.status(201).json(result);
    } catch (error) {
        next(error);
    }
}

// PUT /appointments/:id
export async function updateAppointment(req, res, next) {
    try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({
                message: "Invalid appointment ID",
            });
        }

        const appointmentId = new ObjectId(id);

        const existing = await appointmentsCollection.findOne({
            _id: appointmentId,
            userEmail: req.user.email,
        });

        if (!existing) {
            return res.status(404).json({
                message: "Appointment not found",
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
                _id: appointmentId,
                userEmail: req.user.email,
            },
            {
                $set: checked.value,
            }
        );

        res.json(result);
    } catch (error) {
        next(error);
    }
}

// DELETE /appointments/:id
export async function deleteAppointment(req, res, next) {
    try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({
                message: "Invalid appointment ID",
            });
        }

        const appointmentId = new ObjectId(id);

        const existing = await appointmentsCollection.findOne({
            _id: appointmentId,
            userEmail: req.user.email,
        });

        if (!existing) {
            return res.status(404).json({
                message: "Appointment not found",
            });
        }

        const result = await appointmentsCollection.deleteOne({
            _id: appointmentId,
            userEmail: req.user.email,
        });

        res.json(result);
    } catch (error) {
        next(error);
    }
}

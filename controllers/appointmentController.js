
import { ObjectId } from "mongodb";
import { db } from "../db.js";
import { cleanBooking } from "../validation.js";

const appointmentsCollection = db.collection("appointments");

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
            .find({ userEmail: email })
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

        const result = await appointmentsCollection.insertOne(
            checked.value
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

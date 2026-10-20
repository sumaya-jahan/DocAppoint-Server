
import { db } from "../db.js";
import { escapeRegex } from "../validation.js";
import { validateDoctor } from "../validators/doctorValidator.js";

const doctorsCollection = db.collection("doctors");
const appointmentsCollection = db.collection("appointments");
const usersCollection = db.collection("user");
const contactCollection = db.collection("contactMessages");

// GET /api/admin/overview
export async function getAdminOverview(req, res, next) {
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

            doctorsCollection
                .aggregate([
                    {
                        $group: {
                            _id: {
                                $ifNull: [
                                    "$specialty",
                                    "Unspecified",
                                ],
                            },
                            count: { $sum: 1 },
                        },
                    },
                    { $sort: { count: -1 } },
                    { $limit: 12 },
                ])
                .toArray(),

            appointmentsCollection
                .aggregate([
                    {
                        $match: {
                            appointmentDate: {
                                $type: "string",
                            },
                        },
                    },
                    {
                        $group: {
                            _id: {
                                $substrBytes: [
                                    "$appointmentDate",
                                    0,
                                    7,
                                ],
                            },
                            count: { $sum: 1 },
                        },
                    },
                    { $sort: { _id: 1 } },
                    { $limit: 24 },
                ])
                .toArray(),

            appointmentsCollection
                .aggregate([
                    {
                        $group: {
                            _id: {
                                $ifNull: [
                                    "$status",
                                    "Booked",
                                ],
                            },
                            count: { $sum: 1 },
                        },
                    },
                ])
                .toArray(),
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

// GET /api/admin/doctors
// Supports search, pagination and sorting
export async function getAdminDoctors(req, res, next) {
    try {
        const page = Math.max(
            1,
            Math.min(100000, parseInt(req.query.page, 10) || 1)
        );

        const limit = 10;

        const search = String(
            req.query.search || ""
        ).slice(0, 80);

        // Only approved database fields may be used for sorting.
        const allowedSort = [
            "name",
            "specialty",
            "location",
            "fee",
            "rating",
        ];

        const sortBy = allowedSort.includes(req.query.sortBy)
            ? req.query.sortBy
            : "name";

        const order = req.query.order === "desc" ? -1 : 1;

        const query = search
            ? {
                name: {
                    $regex: escapeRegex(search),
                    $options: "i",
                },
            }
            : {};

        const [items, total] = await Promise.all([
            doctorsCollection
                .find(query)
                .sort({
                    [sortBy]: order,
                    _id: 1,
                })
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

// POST /api/admin/doctors
export async function createAdminDoctor(req, res, next) {
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

// PATCH /api/admin/doctors/:id
export async function updateAdminDoctor(req, res, next) {
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

        res.json({
            message: "Doctor updated",
        });
    } catch (error) {
        next(error);
    }
}

// DELETE /api/admin/doctors/:id
export async function deleteAdminDoctor(req, res, next) {
    try {
        const result = await doctorsCollection.deleteOne({
            id: req.params.id,
        });

        if (!result.deletedCount) {
            return res.status(404).json({
                message: "Doctor not found",
            });
        }

        res.json({
            message: "Doctor deleted",
        });
    } catch (error) {
        next(error);
    }
}

// GET /api/admin/users
// Supports pagination and sorting
export async function getAdminUsers(req, res, next) {
    try {
        const page = Math.max(
            1,
            Math.min(100000, parseInt(req.query.page, 10) || 1)
        );

        const limit = 10;

        const allowedSort = [
            "name",
            "email",
            "createdAt",
        ];

        const sortBy = allowedSort.includes(req.query.sortBy)
            ? req.query.sortBy
            : "createdAt";

        const order = req.query.order === "asc" ? 1 : -1;

        const [items, total] = await Promise.all([
            usersCollection
                .find(
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
                .sort({
                    [sortBy]: order,
                    _id: 1,
                })
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

// GET /api/admin/contacts
export async function getAdminContacts(req, res, next) {
    try {
        const page = Math.max(
            1,
            parseInt(req.query.page, 10) || 1
        );

        const limit = 10;

        const [items, total] = await Promise.all([
            contactCollection
                .find({})
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

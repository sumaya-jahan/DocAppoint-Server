
import { db } from "../config/database.js";
import { escapeRegex } from "../validation.js";

const doctorsCollection = db.collection("doctors");

export async function getDoctors(req, res, next) {
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
            doctorsCollection
                .find(query)
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
}

export async function getDoctorById(req, res, next) {
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

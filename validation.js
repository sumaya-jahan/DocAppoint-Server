
const str = (value, max = 150) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.trim().length <= max;

const phone = (value) =>
  typeof value === "string" &&
  /^[+\d()\s-]{7,20}$/.test(value);

const time = (value) =>
  typeof value === "string" &&
  /^(?:([01]\d|2[0-3]):[0-5]\d|(?:0?[1-9]|1[0-2]):[0-5]\d\s?(?:AM|PM))$/i.test(value);

const isoDate = (value) => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
};

const todayInBangladesh = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
};

export function cleanBooking(
  data,
  { create = false, email } = {}
) {
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    return { error: "Invalid request body" };
  }

  const fields = [
    "patientName",
    "gender",
    "phone",
    "appointmentDate",
    "appointmentTime",
  ];

  const result = {};

  for (const field of fields) {
    if (data[field] === undefined) {
      continue;
    }

    const value = data[field];

    let valid;

    if (field === "phone") {
      valid = phone(value);
    } else if (field === "appointmentDate") {
      valid = isoDate(value);
    } else if (field === "appointmentTime") {
      valid = time(value);
    } else {
      valid = str(value, 150);
    }

    if (!valid) {
      return {
        error: `Invalid ${field}`,
      };
    }

    result[field] = value.trim();
  }

  if (
    result.appointmentDate &&
    result.appointmentDate < todayInBangladesh()
  ) {
    return {
      error: "Appointment date cannot be in the past",
    };
  }

  if (create) {
    if (!str(data.doctorName)) {
      return {
        error: "Doctor information is required",
      };
    }

    if (data.userEmail !== email) {
      return {
        error: "Booking account does not match logged-in user",
        status: 403,
      };
    }

    const requiredFields = [
      "patientName",
      "phone",
      "appointmentDate",
      "appointmentTime",
    ];

    if (
      !requiredFields.every(
        (field) => field in result
      )
    ) {
      return {
        error: "Required appointment information is missing",
      };
    }

    if (data.doctorId !== undefined) {
      if (
        !["string", "number"].includes(
          typeof data.doctorId
        ) ||
        !str(String(data.doctorId), 150)
      ) {
        return {
          error: "Invalid doctorId",
        };
      }

      result.doctorId = String(
        data.doctorId
      ).trim();
    }

    result.userEmail = email;
    result.doctorName = data.doctorName.trim();
    result.createdAt = new Date();
  } else if (Object.keys(result).length === 0) {
    return {
      error: "No editable fields were provided",
    };
  }

  return { value: result };
}

export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

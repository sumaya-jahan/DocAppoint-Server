// Validate and whitelist user input before it reaches MongoDB.
const str = (value, max = 150) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
const isoDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const time = value => typeof value === 'string' && /^(?:([01]\d|2[0-3]):[0-5]\d|(?:0?[1-9]|1[0-2]):[0-5]\d\s?(?:AM|PM))$/i.test(value);
const phone = value => typeof value === 'string' && /^[+\d()\s-]{7,20}$/.test(value);

export function cleanBooking(data, { create = false, email } = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'Invalid request body' };
  const fields = ['patientName', 'gender', 'phone', 'appointmentDate', 'appointmentTime'];
  const result = {};
  for (const field of fields) {
    if (data[field] !== undefined) {
      const value = data[field];
      const valid = field === 'phone' ? phone(value) : field === 'appointmentDate' ? isoDate(value) : field === 'appointmentTime' ? time(value) : str(value, 150);
      if (!valid) return { error: `Invalid ${field}` };
      result[field] = value.trim();
    }
  }
  if (create) {
    if (!str(data.doctorName) || !str(data.doctorId ?? data.doctorName)) return { error: 'Doctor information is required' };
    if (data.userEmail !== email) return { error: 'Booking account does not match logged-in user', status: 403 };
    if (!['patientName', 'phone', 'appointmentDate', 'appointmentTime'].every(key => key in result)) return { error: 'Required appointment information is missing' };
    result.userEmail = email;
    result.doctorName = data.doctorName.trim();
    if (data.doctorId !== undefined) result.doctorId = String(data.doctorId);
    if (data.doctorFee !== undefined && Number.isFinite(Number(data.doctorFee)) && Number(data.doctorFee) >= 0) result.doctorFee = Number(data.doctorFee);
    result.createdAt = new Date();
  } else if (Object.keys(result).length === 0) {
    return { error: 'No editable fields were provided' };
  }
  return { value: result };
}

export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

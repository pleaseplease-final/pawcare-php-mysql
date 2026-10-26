// Keep booking controls aligned with the clinic API role boundary.
export const canBookAppointments = role => ["owner", "assistant"].includes(role);

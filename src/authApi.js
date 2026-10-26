/* Sign-in and account network calls.
   Matches login_registration API routes and validation wirings.
*/
import { api } from "./api.js";

export const auth = {
  me: () => api.get("/api/auth/me"),
  login: (email, password) => api.post("/api/auth/login", { email, password }),
  register: (d) => api.post("/api/auth/register", d),
  resendVerification: (email) => api.post("/api/auth/resend-verification", { email }),
  verifyEmail: (token) => api.get(`/api/auth/verify-email?token=${encodeURIComponent(token)}`),
  unlock: (token) => api.post("/api/auth/unlock", { token }),
  otpInfo: () => api.get("/api/auth/otp/info"),
  otpSend: () => api.post("/api/auth/otp/resend"),
  otpVerify: (code) => api.post("/api/auth/otp/verify", { code }),
  forgot: (identifier) => api.post("/api/auth/forgot", { identifier }),
  reset: (d) => api.post("/api/auth/reset", d),
  profile: () => api.get("/api/auth/profile"),
  profilePhoto: (photo) => api.post("/api/auth/profile/photo", { photo }),
  changePassword: (d) => api.post("/api/auth/password", d),
  verifyContact: (d) => api.post("/api/auth/profile/contact/verify", d),
  updateContact: (d) => api.post("/api/auth/profile/contact", d),
  petPhoto: (id, photo) => api.post(`/api/owner/pets/${id}/photo`, { photo }),
  petAllergy: (id, d) => api.post(`/api/owner/pets/${id}/allergies`, d),
  petWeight: (id, d) => api.post(`/api/owner/pets/${id}/weights`, d),
  petNotes: (id, notes) => api.post(`/api/owner/pets/${id}/notes`, { notes }),
  staffEmailAvailability: (email) => api.get(`/api/admin/staff/email-availability?email=${encodeURIComponent(email)}`),
  inviteStaff: (d) => api.post("/api/auth/staff/invite", d),
  staffInviteInfo: (token) => api.get(`/api/auth/staff/invite-info?token=${encodeURIComponent(token)}`),
  staffAcceptInvite: (d) => api.post("/api/auth/staff/accept-invite", d),
  logout: () => api.post("/api/auth/logout"),
  available: (field, value) => api.get(`/api/auth/available?field=${field}&value=${encodeURIComponent(value)}`),
  countries: (q = "") => api.get(`/api/geo/countries?q=${encodeURIComponent(q)}`),
  country: (code) => api.get(`/api/geo/countries/${encodeURIComponent(code)}`),
  states: (country, q = "") => api.get(`/api/geo/states?country=${encodeURIComponent(country)}&q=${encodeURIComponent(q)}`),
  cities: (country, state, q = "") => api.get(`/api/geo/cities?country=${encodeURIComponent(country)}&state=${encodeURIComponent(state)}&q=${encodeURIComponent(q)}`),
  zips: (country, state, city) => api.get(`/api/geo/zips?country=${encodeURIComponent(country)}&state=${encodeURIComponent(state)}&city=${encodeURIComponent(city)}`),
  validateAddress: (d) => api.post("/api/geo/validate", d),
  checkEmail: (email) => api.post("/api/check/email", { email }),
  checkMobile: (country, mobile) => api.post("/api/check/mobile", { country, mobile }),
};

export const OFFLINE_MSG = "We can’t reach the clinic server. Please try again in a moment.";
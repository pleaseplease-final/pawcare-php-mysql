import {pn,pwOk} from './textRules.js';
import {parsePhoneNumberFromString} from 'libphonenumber-js/max';

export function validateStaffSetupField(field, val, formData) {
    const v = String(val || "").trim();
    switch (field) {
      case "firstName":
        if (!v) return "First name is required.";
        if (/\d/.test(val)) return "Numbers are not allowed in names. Please use letters only.";
        if (v.length < 2) return "First name must be at least 2 characters.";
        if (v.length > 50) return "First name cannot exceed 50 characters.";
        return pn(v);
      case "lastName":
        if (!v) return "Last name is required.";
        if (/\d/.test(val)) return "Numbers are not allowed in names. Please use letters only.";
        if (v.length < 2) return "Last name must be at least 2 characters.";
        if (v.length > 50) return "Last name cannot exceed 50 characters.";
        return pn(v);
      case "middleInitial":
        return !v || /^[\p{L}]\.?$/u.test(v) ? "" : "Use 1 letter, optionally followed by a period (e.g. M or M.).";
      case "birthday": {
        if (!v) return "Date of birth is required.";
        const parsed = new Date(v + "T00:00:00Z");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(parsed.getTime()) || parsed.toISOString().slice(0,10)!==v || v<'1900-01-01') return "Enter a valid date.";
        const dt = new Date(v + "T00:00:00");
        const today = new Date();
        if (dt > today) return "Birth date cannot be in the future.";
        const eighteenYearsAgo = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
        if (dt > eighteenYearsAgo) return "Staff members must be at least 18 years old.";
        return "";
      }
      case "houseStreet":
        if (!v) return "House number and street address are required.";
        return v.length >= 3 && v.length<=255 ? "" : "Use 3–255 characters for the street address.";
      case "city":
        return v.length >= 2 && v.length<=100 ? "" : "Enter a city/municipality (2–100 characters).";
      case "mobileNumber": {
        const phone=parsePhoneNumberFromString(v,'PH');
        return phone?.isValid() && ['MOBILE','FIXED_LINE_OR_MOBILE'].includes(phone.getType()) ? '' : 'Enter a valid Philippine mobile number (e.g. +63 917 123 4567).';
      }
      case "state":
        return v.length>=2 && v.length<=100 ? '' : 'Enter a province or state (2–100 characters).';
      case "zipCode":
        return v.length<=20 ? '' : 'Keep the postal code under 20 characters.';
      case "password":
        return pwOk(val) ? "" : "Password must use 12–128 characters with upper, lower, number and symbol.";
      case "confirmPassword":
        return val === formData.password ? "" : "Passwords do not match.";
      default:
        return "";
    }
  }

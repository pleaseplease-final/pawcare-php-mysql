// Roles an administrator can invite and manage. Owners register themselves and are not listed here.
export const STAFF_ROLES = {
  vet: {label: 'Veterinarian', plural: 'Veterinarians', blurb: 'Clinical Queue & EMR'},
  assistant: {label: 'Vet Assistant', plural: 'Assistants', blurb: 'Front Desk & Operations'},
  admin: {label: 'Clinic Administrator', plural: 'Administrators', blurb: 'Full access: staff, prices, reports and audit trail'},
};
export const staffRoleLabel = role => STAFF_ROLES[role]?.label || 'Vet Assistant';

// One set of address rules for registration-style forms, the profile and the server.
const STREET = /^[\p{L}0-9 .,#'’\/-]{3,255}$/u;
const PLACE = /^[\p{L}\p{M}0-9 .,'’()\/&-]{2,100}$/u;
const isPhilippines = country => /^(philippines|ph)$/i.test(String(country || '').trim());

export function addressErrors({houseStreet = '', city = '', state = '', country = '', zipCode = ''} = {}) {
  const e = {}, clean = value => String(value ?? '').trim();
  if (!STREET.test(clean(houseStreet))) e.houseStreet = 'Enter a valid house number and street (3 to 255 characters).';
  if (!clean(country)) e.country = 'Select a country.';
  if (!PLACE.test(clean(state))) e.state = 'Enter a valid province or state (2 to 100 characters).';
  if (!PLACE.test(clean(city))) e.city = 'Enter a valid city or municipality (2 to 100 characters).';
  const zip = clean(zipCode);
  if (isPhilippines(country) ? !/^\d{4}$/.test(zip) : !/^[A-Za-z0-9][A-Za-z0-9 -]{1,18}[A-Za-z0-9]$/.test(zip)) e.zipCode = isPhilippines(country) ? 'A Philippine ZIP code has 4 digits.' : 'Enter a valid ZIP / postal code.';
  return e;
}

// Shared validation for optional identifiers recorded by the attending veterinarian.
export function vaccinationCardFieldErrors({manufacturer,serialNumber,microchipNumber,microchipDate}={},today){
 const errors={};
 for(const [key,label,value,max] of [['manufacturer','Manufacturer',manufacturer,100],['serialNumber','Serial number',serialNumber,100],['microchipNumber','Microchip number',microchipNumber,50]]){
  if(value!==undefined && (typeof value!=='string' || value.length>max))errors[key]=`${label} must be text of no more than ${max} characters.`;
 }
 if(microchipDate!==undefined && microchipDate!==null && microchipDate!=='' && (typeof microchipDate!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(microchipDate) || !Number.isFinite(Date.parse(microchipDate)) || new Date(microchipDate).toISOString().slice(0,10)!==microchipDate || (today && microchipDate>today)))errors.microchipDate='Enter a real implantation / scan date that is not in the future.';
 if(microchipDate && (typeof microchipNumber!=='string' || !microchipNumber.trim()))errors.microchipNumber='Enter the microchip number for this implantation / scan date.';
 return errors;
}

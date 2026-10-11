export const medicationTimes = ['Πρωί', 'Μεσημέρι', 'Βράδυ'] as const;
export type MedicationTime = typeof medicationTimes[number];

// Only our explicit daily time labels are parsed. Legacy/free-text prescriptions
// (PRN, weekly, unequal doses, etc.) must never be guessed or silently replaced.
export function selectedMedicationTimes(value:string):MedicationTime[]|null {
 const parts=value.trim()?value.split('+').map(part=>part.trim()):[];
 if(parts.some(part=>!medicationTimes.includes(part as MedicationTime)))return null;
 return medicationTimes.filter(time=>parts.includes(time));
}
export function toggleMedicationTime(value:string,time:MedicationTime):string {
 const selected=selectedMedicationTimes(value);
 if(!selected)return value;
 return medicationTimes.filter(item=>item===time?!selected.includes(item):selected.includes(item)).join(' + ');
}

export function draftSaveStatus({saving,dirty,error,savedAt='',recorded=true}:{saving:boolean;dirty:boolean;error?:string;savedAt?:string;recorded?:boolean},translate:(value:string)=>string=value=>value){
 if(error)return translate('Δεν αποθηκεύτηκαν όλες οι αλλαγές — το κείμενό σας διατηρείται. ')+error;
 if(saving)return translate('Αποθήκευση αλλαγών…');
 if(dirty)return translate('Αλλαγές σε αναμονή αποθήκευσης…');
 return recorded?translate('Οι σημειώσεις αποθηκεύτηκαν — η καταγραφή παραμένει ανοιχτή')+(savedAt?' · '+savedAt:''):translate('Δεν έχει καταγραφεί');
}

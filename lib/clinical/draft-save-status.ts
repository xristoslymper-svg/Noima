export function draftSaveStatus({saving,dirty,error,savedAt='',recorded=true}:{saving:boolean;dirty:boolean;error?:string;savedAt?:string;recorded?:boolean}){
 if(error)return 'Δεν αποθηκεύτηκαν όλες οι αλλαγές — το κείμενό σας διατηρείται. '+error;
 if(saving)return 'Αποθήκευση αλλαγών…';
 if(dirty)return 'Αλλαγές σε αναμονή αποθήκευσης…';
 return recorded?'Οι σημειώσεις αποθηκεύτηκαν — η καταγραφή παραμένει ανοιχτή'+(savedAt?' · '+savedAt:''):'Δεν έχει καταγραφεί';
}

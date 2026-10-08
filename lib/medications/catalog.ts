export type MedicationCatalogItem={
 id:string;
 brand:string;
 active:string;
 form?:string;
 aliases?:string[];
};

export const medicationCatalog:MedicationCatalogItem[]=[
 {id:'quetiapine-seroquel',brand:'SEROQUEL',active:'Quetiapine',form:'Δισκία',aliases:['κουετιαπινη','κουετιαπίνη']},
 {id:'quetiapine-generic',brand:'QUETIAPINE',active:'Quetiapine',form:'Δισκία',aliases:['generic','κουετιαπινη','κουετιαπίνη']},
 {id:'olanzapine-zyprexa',brand:'ZYPREXA',active:'Olanzapine',form:'Δισκία',aliases:['ολανζαπινη','ολανζαπίνη']},
 {id:'olanzapine-generic',brand:'OLANZAPINE',active:'Olanzapine',form:'Δισκία',aliases:['generic','ολανζαπινη','ολανζαπίνη']},
 {id:'aripiprazole-abilify',brand:'ABILIFY',active:'Aripiprazole',form:'Δισκία',aliases:['αριπιπραζολη','αριπιπραζόλη']},
 {id:'aripiprazole-generic',brand:'ARIPIPRAZOLE',active:'Aripiprazole',form:'Δισκία',aliases:['generic','αριπιπραζολη','αριπιπραζόλη']},
 {id:'risperidone-risperdal',brand:'RISPERDAL',active:'Risperidone',form:'Δισκία / πόσιμο διάλυμα',aliases:['ρισπεριδονη','ρισπεριδόνη']},
 {id:'risperidone-generic',brand:'RISPERIDONE',active:'Risperidone',form:'Δισκία',aliases:['generic','ρισπεριδονη','ρισπεριδόνη']},
 {id:'amisulpride-solian',brand:'SOLIAN',active:'Amisulpride',form:'Δισκία',aliases:['αμισουλπριδη','αμισουλπρίδη']},
 {id:'amisulpride-generic',brand:'AMISULPRIDE',active:'Amisulpride',form:'Δισκία',aliases:['generic']},
 {id:'clozapine-leponex',brand:'LEPONEX',active:'Clozapine',form:'Δισκία',aliases:['κλοζαπινη','κλοζαπίνη']},
 {id:'clozapine-generic',brand:'CLOZAPINE',active:'Clozapine',form:'Δισκία',aliases:['generic']},
 {id:'haloperidol-haldol',brand:'HALDOL',active:'Haloperidol',form:'Δισκία / σταγόνες',aliases:['αλοπεριδολη','αλοπεριδόλη']},
 {id:'haloperidol-generic',brand:'HALOPERIDOL',active:'Haloperidol',form:'Δισκία',aliases:['generic']},
 {id:'lurasidone-latuda',brand:'LATUDA',active:'Lurasidone',form:'Δισκία',aliases:['λουρασιδονη','λουρασιδόνη']},
 {id:'paliperidone-invega',brand:'INVEGA',active:'Paliperidone',form:'Δισκία παρατεταμένης αποδέσμευσης',aliases:['παλιπεριδονη','παλιπεριδόνη']},
 {id:'ziprasidone-zeldox',brand:'ZELDOX',active:'Ziprasidone',form:'Κάψουλες',aliases:['ζιπρασιδονη','ζιπρασιδόνη']},
 {id:'sertindole-serdolect',brand:'SERDOLECT',active:'Sertindole',form:'Δισκία',aliases:['σερτινδολη','σερτινδόλη']},
 {id:'lamotrigine-lamictal',brand:'LAMICTAL',active:'Lamotrigine',form:'Δισκία',aliases:['λαμοτριγινη','λαμοτριγίνη']},
 {id:'lamotrigine-generic',brand:'LAMOTRIGINE',active:'Lamotrigine',form:'Δισκία',aliases:['generic']},
 {id:'valproate-depakine',brand:'DEPAKINE',active:'Valproate / Sodium valproate',form:'Δισκία / πόσιμο',aliases:['βαλπροικο','βαλπροϊκό','valproic']},
 {id:'carbamazepine-tegretol',brand:'TEGRETOL',active:'Carbamazepine',form:'Δισκία',aliases:['καρβαμαζεπινη','καρβαμαζεπίνη']},
 {id:'carbamazepine-generic',brand:'CARBAMAZEPINE',active:'Carbamazepine',form:'Δισκία',aliases:['generic']},
 {id:'lithium-generic',brand:'LITHIUM',active:'Lithium carbonate',form:'Δισκία',aliases:['λιθιο','λίθιο']},
 {id:'escitalopram-cipralex',brand:'CIPRALEX',active:'Escitalopram',form:'Δισκία / σταγόνες',aliases:['εσιταλοπραμη','εσιταλοπράμη']},
 {id:'escitalopram-generic',brand:'ESCITALOPRAM',active:'Escitalopram',form:'Δισκία',aliases:['generic']},
 {id:'citalopram-seropram',brand:'SEROPRAM',active:'Citalopram',form:'Δισκία',aliases:['σιταλοπραμη','σιταλοπράμη']},
 {id:'citalopram-generic',brand:'CITALOPRAM',active:'Citalopram',form:'Δισκία',aliases:['generic']},
 {id:'sertraline-zoloft',brand:'ZOLOFT',active:'Sertraline',form:'Δισκία',aliases:['σερτραλινη','σερτραλίνη']},
 {id:'sertraline-generic',brand:'SERTRALINE',active:'Sertraline',form:'Δισκία',aliases:['generic']},
 {id:'fluoxetine-ladose',brand:'LADOSE',active:'Fluoxetine',form:'Κάψουλες',aliases:['φλουοξετινη','φλουοξετίνη']},
 {id:'fluoxetine-generic',brand:'FLUOXETINE',active:'Fluoxetine',form:'Κάψουλες',aliases:['generic']},
 {id:'paroxetine-seroxat',brand:'SEROXAT',active:'Paroxetine',form:'Δισκία',aliases:['παροξετινη','παροξετίνη']},
 {id:'paroxetine-generic',brand:'PAROXETINE',active:'Paroxetine',form:'Δισκία',aliases:['generic']},
 {id:'venlafaxine-efexor',brand:'EFEXOR',active:'Venlafaxine',form:'Κάψουλες παρατεταμένης αποδέσμευσης',aliases:['βενλαφαξινη','βενλαφαξίνη']},
 {id:'venlafaxine-generic',brand:'VENLAFAXINE',active:'Venlafaxine',form:'Δισκία / κάψουλες',aliases:['generic']},
 {id:'duloxetine-cymbalta',brand:'CYMBALTA',active:'Duloxetine',form:'Κάψουλες',aliases:['ντουλοξετινη','ντουλοξετίνη']},
 {id:'duloxetine-generic',brand:'DULOXETINE',active:'Duloxetine',form:'Κάψουλες',aliases:['generic']},
 {id:'mirtazapine-remeron',brand:'REMERON',active:'Mirtazapine',form:'Δισκία',aliases:['μιρταζαπινη','μιρταζαπίνη']},
 {id:'mirtazapine-generic',brand:'MIRTAZAPINE',active:'Mirtazapine',form:'Δισκία',aliases:['generic']},
 {id:'bupropion-wellbutrin',brand:'WELLBUTRIN',active:'Bupropion',form:'Δισκία παρατεταμένης αποδέσμευσης',aliases:['βουπροπιονη','βουπροπιόνη']},
 {id:'vortioxetine-brintellix',brand:'BRINTELLIX',active:'Vortioxetine',form:'Δισκία / σταγόνες',aliases:['βορτιοξετινη','βορτιοξετίνη']},
 {id:'clomipramine-anafranil',brand:'ANAFRANIL',active:'Clomipramine',form:'Δισκία',aliases:['κλομιπραμινη','κλομιπραμίνη']},
 {id:'amitriptyline-saroten',brand:'SAROTEN',active:'Amitriptyline',form:'Δισκία',aliases:['αμιτριπτυλινη','αμιτριπτυλίνη']},
 {id:'trazodone-trittico',brand:'TRITTICO',active:'Trazodone',form:'Δισκία',aliases:['τραζοδονη','τραζοδόνη']},
 {id:'alprazolam-xanax',brand:'XANAX',active:'Alprazolam',form:'Δισκία',aliases:['αλπραζολαμη','αλπραζολάμη']},
 {id:'lorazepam-tavor',brand:'TAVOR',active:'Lorazepam',form:'Δισκία',aliases:['λοραζεπαμη','λοραζεπάμη']},
 {id:'bromazepam-lexotanil',brand:'LEXOTANIL',active:'Bromazepam',form:'Δισκία',aliases:['βρωμαζεπαμη','βρωμαζεπάμη']},
 {id:'diazepam-stedon',brand:'STEDON',active:'Diazepam',form:'Δισκία',aliases:['διαζεπαμη','διαζεπάμη']},
 {id:'clonazepam-rivotril',brand:'RIVOTRIL',active:'Clonazepam',form:'Δισκία / σταγόνες',aliases:['κλοναζεπαμη','κλοναζεπάμη']},
 {id:'zolpidem-stilnox',brand:'STILNOX',active:'Zolpidem',form:'Δισκία',aliases:['ζολπιδεμη','ζολπιδέμη']},
 {id:'pregabalin-lyrica',brand:'LYRICA',active:'Pregabalin',form:'Κάψουλες',aliases:['πρεγκαμπαλινη','πρεγκαμπαλίνη']},
 {id:'pregabalin-generic',brand:'PREGABALIN',active:'Pregabalin',form:'Κάψουλες',aliases:['generic']},
 {id:'gabapentin-neurontin',brand:'NEURONTIN',active:'Gabapentin',form:'Κάψουλες / δισκία',aliases:['γκαμπαπεντινη','γκαμπαπεντίνη']},
 {id:'atomoxetine-strattera',brand:'STRATTERA',active:'Atomoxetine',form:'Κάψουλες',aliases:['ατομοξετινη','ατομοξετίνη']},
 {id:'methylphenidate-concerta',brand:'CONCERTA',active:'Methylphenidate',form:'Δισκία παρατεταμένης αποδέσμευσης',aliases:['μεθυλφαινιδατη','μεθυλφαινιδάτη']},
 {id:'methylphenidate-ritalin',brand:'RITALIN',active:'Methylphenidate',form:'Δισκία',aliases:['μεθυλφαινιδατη','μεθυλφαινιδάτη']},
 {id:'propranolol-inderal',brand:'INDERAL',active:'Propranolol',form:'Δισκία',aliases:['προπρανολολη','προπρανολόλη']},
 {id:'melatonin-circadin',brand:'CIRCADIN',active:'Melatonin',form:'Δισκία παρατεταμένης αποδέσμευσης',aliases:['μελατονινη','μελατονίνη']}
];

export const normalizeMedicationSearch=(value:string)=>value
 .normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'')
 .toLowerCase()
 .replace(/[^a-z0-9α-ωάέήίόύώϊϋΐΰ]+/gi,' ')
 .trim();

export function searchMedicationCatalog(query:string,limit=12){
 const q=normalizeMedicationSearch(query);
 if(!q)return [];
 const tokens=q.split(/\s+/).filter(Boolean);
 return medicationCatalog
  .map(item=>{
   const brand=normalizeMedicationSearch(item.brand);
   const active=normalizeMedicationSearch(item.active);
   const aliases=(item.aliases||[]).map(normalizeMedicationSearch);
   const haystack=[brand,active,...aliases].join(' ');
   if(!tokens.every(token=>haystack.includes(token)))return null;
   let score=0;
   if(brand===q)score+=120;
   else if(brand.startsWith(q))score+=90;
   else if(brand.includes(q))score+=60;
   if(active===q)score+=80;
   else if(active.startsWith(q))score+=55;
   else if(active.includes(q))score+=35;
   if(aliases.some(alias=>alias.startsWith(q)))score+=25;
   score-=Math.min(brand.length,30)/100;
   return {item,score};
  })
  .filter((row):row is {item:MedicationCatalogItem;score:number}=>Boolean(row))
  .sort((a,b)=>b.score-a.score||a.item.brand.localeCompare(b.item.brand))
  .slice(0,limit)
  .map(row=>row.item);
}

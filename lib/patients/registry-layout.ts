export const registryColumns=[
  {
    "id": "registry",
    "label": "Α/Α",
    "width": 72,
    "visible": true
  },
  {
    "id": "name",
    "label": "Ονοματεπώνυμο",
    "width": 240,
    "visible": true
  },
  {
    "id": "age",
    "label": "Ηλικία",
    "width": 76,
    "visible": true
  },
  {
    "id": "phone",
    "label": "Κινητό",
    "width": 145,
    "visible": true
  },
  {
    "id": "diagnosis",
    "label": "ICD-10",
    "width": 100,
    "visible": true
  },
  {
    "id": "last",
    "label": "Τελευταία επίσκεψη",
    "width": 150,
    "visible": true
  },
  {
    "id": "next",
    "label": "Επόμενο ραντεβού",
    "width": 170,
    "visible": true
  },
  {
    "id": "email",
    "label": "Email",
    "width": 240,
    "visible": false
  },
  {
    "id": "landline",
    "label": "Σταθερό",
    "width": 145,
    "visible": false
  },
  {
    "id": "contact",
    "label": "Επιπλέον τηλέφωνο",
    "width": 155,
    "visible": false
  },
  {
    "id": "address",
    "label": "Διεύθυνση",
    "width": 240,
    "visible": false
  },
  {
    "id": "diagnosisLabel",
    "label": "Διάγνωση",
    "width": 240,
    "visible": false
  },
  {
    "id": "status",
    "label": "Κατάσταση φακέλου",
    "width": 150,
    "visible": false
  },
  {
    "id": "draft",
    "label": "Καταγραφή επίσκεψης",
    "width": 180,
    "visible": false
  },
  {
    "id": "complaint",
    "label": "Λόγος προσέλευσης",
    "width": 260,
    "visible": false
  },
  {
    "id": "note",
    "label": "Σημείωση φακέλου",
    "width": 260,
    "visible": false
  },
  {
    "id": "created",
    "label": "Δημιουργία φακέλου",
    "width": 150,
    "visible": false
  },
  {
    "id": "updated",
    "label": "Ενημέρωση φακέλου",
    "width": 150,
    "visible": false
  }
] as const;
export type RegistryColumnId=(typeof registryColumns)[number]['id'];
export type RegistryLayout={version:1;order:RegistryColumnId[];hidden:RegistryColumnId[]};
export type PatientRegistryRow={id:string;first_name:string;last_name:string;reported_age:number|null;phone?:string;landline?:string;contact_phone?:string;email?:string;address?:string;note:string;chief_complaint:string;status:string;created_at:string;updated_at:string;registry_number:number;diagnosis:{code:string;label:string}|null;draft?:{id:string}|null;last_session?:{completed_at:string}|null;next_appointment?:{scheduled_start:string}|null};
const valid=(value:unknown):value is RegistryColumnId=>typeof value==='string'&&registryColumns.some(c=>c.id===value);
export const defaultRegistryLayout=():RegistryLayout=>({version:1,order:registryColumns.map(c=>c.id),hidden:registryColumns.filter(c=>!c.visible).map(c=>c.id)});
export function normalizeRegistryLayout(value:unknown):RegistryLayout{
 const base=defaultRegistryLayout();
 if(!value||typeof value!=='object'||!('version' in value)||value.version!==1)return base;
 const raw=value as Partial<RegistryLayout>;
 const ordered=Array.isArray(raw.order)?raw.order.filter(valid):[];
 const hidden=Array.isArray(raw.hidden)?raw.hidden.filter(valid):base.hidden;
 return {version:1,order:[...new Set([...ordered,...base.order])],hidden:[...new Set(hidden)].filter(id=>id!=='name')};
}
export function moveRegistryColumn(layout:RegistryLayout,source:RegistryColumnId,target:RegistryColumnId):RegistryLayout{
 const current=normalizeRegistryLayout(layout);
 if(source===target||!current.order.includes(source)||!current.order.includes(target))return current;
 const order=current.order.filter(id=>id!==source);
 order.splice(current.order.indexOf(target),0,source);
 return {...current,order};
}
export function showRegistryColumn(layout:RegistryLayout,id:RegistryColumnId,show:boolean):RegistryLayout{
 const current=normalizeRegistryLayout(layout);
 if(!valid(id)||id==='name')return current;
 return {...current,hidden:show?current.hidden.filter(key=>key!==id):[...new Set([...current.hidden,id])]};
}
export const registryLayoutKey=(owner:string)=>owner?'noima:registry-columns:v1:'+encodeURIComponent(owner):null;

export type RiskTree={version:1;answers:Record<string,string>;notes:Record<string,string>;writing_provenance?:Record<string,import('./clinical-writing').WritingProvenance>};
export const riskTreeChoices=[['positive','Ναι'],['negative','Όχι'],['unknown','Άγνωστο'],['not_assessed','Δεν διερευνήθηκε']] as const;
export const riskTreeQuestions:Record<string,{title:string;hint?:string;choices:ReadonlyArray<readonly [string,string]>}>={
 wish:{title:'Υπάρχει επιθυμία θανάτου ή πρόθεση να πεθάνει;',hint:'Συμπεριλαμβάνεται η παθητική επιθυμία θανάτου.',choices:riskTreeChoices},
 acted:{title:'Υπήρξε πράξη σχετική με αυτές τις σκέψεις;',choices:riskTreeChoices},
 injury:{title:'Η πράξη προκάλεσε βλάβη στον εαυτό;',choices:riskTreeChoices},
 ideation:{title:'Πώς περιγράφονται οι αυτοκτονικές σκέψεις;',choices:[['passive','Παθητικές'],['active','Ενεργές'],['both','Και τα δύο'],['unknown','Άγνωστο'],['not_assessed','Δεν διερευνήθηκε']]},
 intent:{title:'Υπάρχει πρόθεση να ενεργήσει για να πεθάνει;',choices:riskTreeChoices},
 plan:{title:'Υπάρχει συγκεκριμένο σχέδιο / μέθοδος;',choices:riskTreeChoices},
 selfthoughts:{title:'Υπάρχουν σκέψεις ή συμπεριφορές αυτοτραυματισμού χωρίς επιθυμία θανάτου;',choices:riskTreeChoices},
 selfacted:{title:'Υπήρξε πράξη αυτοτραυματισμού;',choices:riskTreeChoices},
 others:{title:'Υπάρχουν σκέψεις ή συμπεριφορές βλάβης προς άλλους;',choices:riskTreeChoices}
};
export function riskTreePath(a:Record<string,string>){const p=['wish'];if(a.wish==='positive'){p.push('acted');if(a.acted==='positive')p.push('injury');if(a.acted==='negative')p.push('ideation');p.push('intent','plan')}if(a.wish==='negative'){p.push('selfthoughts');if(a.selfthoughts==='positive')p.push('selfacted')}return p;}
export function riskTreeHidden(tree:RiskTree){const visible=[...riskTreePath(tree.answers),'others'];return Object.keys(riskTreeQuestions).filter(id=>!visible.includes(id)&&(tree.answers[id]&&tree.answers[id]!=='not_assessed'||tree.notes[id]?.trim()));}
export function riskTreeLabel(id:string,value:string){return riskTreeQuestions[id]?.choices.find(([v])=>v===value)?.[1]||value;}

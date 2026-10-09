// Position the medication autocomplete in the viewport, not inside its
// horizontally scrolling table. Otherwise CSS overflow clips its results.
export type MedicationMenuAnchor={
 left:number;top:number;bottom:number;width:number;
};
export type MedicationMenuPlacement={
 left:number;top:number;width:number;maxHeight:number;
};
export function placeMedicationMenu(
 anchor:MedicationMenuAnchor,
 viewport:{width:number;height:number},
):MedicationMenuPlacement{
 const gutter=8,gap=6,preferredHeight=270,minimumWidth=310;
 const below=Math.max(0,viewport.height-anchor.bottom-gutter-gap);
 const above=Math.max(0,anchor.top-gutter-gap);
 const openAbove=below<Math.min(preferredHeight,180)&&above>below;
 const maxHeight=Math.min(preferredHeight,openAbove?above:below);
 const width=Math.min(Math.max(anchor.width,minimumWidth),Math.max(0,viewport.width-2*gutter));
 const left=Math.min(Math.max(gutter,anchor.left),Math.max(gutter,viewport.width-gutter-width));
 const top=openAbove?Math.max(gutter,anchor.top-gap-maxHeight):anchor.bottom+gap;
 return {left,top,width,maxHeight};
}

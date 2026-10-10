type Rect={left:number;right:number;top:number;bottom:number};
type DockLayout={layoutHeight:number;viewport:{left:number;top:number;width:number;height:number};dock:{width:number;height:number};footers:Rect[]};
/** Coordinates are relative to the layout viewport, including when the keyboard resizes the visual viewport. */
export function recorderDockPosition({layoutHeight,viewport,dock,footers}:DockLayout){
 const gap=12,maxWidth=Math.max(0,viewport.width-2*gap),width=Math.min(dock.width,maxWidth);
 const left=Math.max(viewport.left+gap,viewport.left+viewport.width-gap-width),right=left+width;
 const visualBottom=viewport.top+viewport.height;
 let boundary=visualBottom;
 for(const footer of footers){
  if(footer.right>left&&footer.left<right&&footer.bottom>viewport.top&&footer.top<visualBottom&&footer.bottom>footer.top)boundary=Math.min(boundary,footer.top);
 }
 const top=Math.max(viewport.top+gap,boundary-gap-dock.height);
 return {left,bottom:Math.max(gap,layoutHeight-top-dock.height),maxWidth};
}

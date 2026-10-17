import BlankPrint from './BlankPrint';
export default async function Page({searchParams}:{searchParams:Promise<{tool?:string}>}){
 const q=await searchParams;
 const tool=['history','PHQ-9','GAD-7'].includes(q.tool||'')?q.tool!:'history';
 return <BlankPrint tool={tool}/>;
}

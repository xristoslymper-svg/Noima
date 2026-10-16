/** Identify missing feature RPCs without exposing raw database errors to the clinician. */
export function priorCourseFeatureUnavailable(error:unknown):boolean{
 const message=error instanceof Error?error.message:String(error||'');
 return (message.includes('demo_prior_course_get')||message.includes('demo_prior_course_save'))
   && (message.includes('PGRST202')||message.includes('schema cache')||message.includes('does not exist')||message.includes('Could not find the function'));
}

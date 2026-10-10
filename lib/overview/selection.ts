type Selection = {workspace: string; day: string; patientId: string};

// Keep only an opaque selection on this history entry, never clinical content.
export function overviewSelectionState(history: unknown, selection: Selection) {
  return {...(history && typeof history === 'object' ? history : {}), noimaOverview: selection};
}

export function restoreOverviewSelection(history: unknown, workspace: string, day: string, eligiblePatientIds: string[]): string | null {
  if (!workspace || !history || typeof history !== 'object') return null;
  const saved = (history as {noimaOverview?: Partial<Selection>}).noimaOverview;
  if (!saved || saved.workspace !== workspace || saved.day !== day || typeof saved.patientId !== 'string') return null;
  return eligiblePatientIds.includes(saved.patientId) ? saved.patientId : null;
}

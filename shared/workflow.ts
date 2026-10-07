import type { AppSnapshot } from './types.js';

export function setupChecklist(state: AppSnapshot): { id: string; label: string; complete: boolean }[] {
 const { profile, settings } = state;
 return [
  { id: 'contact', label: 'Your name, email and phone', complete: !!profile.name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email) && !!profile.phone.trim() },
  { id: 'targets', label: 'The jobs you want', complete: settings.careerTargetsConfirmed === true && !!settings.careerStage && !!(settings.rolePriority.length || settings.roleKeywords?.length) },
  { id: 'experience', label: settings.careerStage === 'experienced' ? 'Your years of experience' : settings.careerStage === 'new_grad' ? 'Your graduation month' : 'Your experience level', complete: settings.careerStage === 'experienced' ? settings.yearsExperience != null : settings.careerStage === 'early_career' || settings.careerStage === 'new_grad' && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(profile.graduation) },
  { id: 'authorization', label: 'Your work authorization answers', complete: [profile.authorizationNow, profile.authorizationAtStart, profile.futureSponsorship].every(value => typeof value === 'boolean') && !!profile.authorizationConfirmedAt && Number.isFinite(Date.parse(profile.authorizationConfirmedAt)) },
  { id: 'application', label: 'How your agent may write, fill, and submit', complete: !!settings.applicationPreferences?.confirmedAt && Number.isFinite(Date.parse(settings.applicationPreferences.confirmedAt)) },
  { id: 'resume', label: 'Your original résumé', complete: state.meta.resumeValid },
 ];
}

export function setupComplete(state: AppSnapshot): boolean {
 return setupChecklist(state).every(item => item.complete);
}

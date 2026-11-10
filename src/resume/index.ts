import type { Profile } from '../portfolio/types';
import { planResume, type ResumePlan } from './layout';
import { resumeFilename } from './util';

export type ResumeFormat = 'docx' | 'pdf';
export type ResumeResult = { bytes: Uint8Array; mime: string; filename: string; pages: number; tier: string };
export { planResume, resumeFilename };
export type { ResumePlan };

export const MIME = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

export async function generateResume(profile: Profile, format: ResumeFormat): Promise<ResumeResult> {
  const plan = planResume(profile);
  const bytes = format === 'pdf'
    ? await (await import('./pdf')).renderPdf(profile, plan)
    : await (await import('./docx')).renderDocx(profile, plan);
  return { bytes, mime: MIME[format], filename: resumeFilename(profile, format), pages: format === 'pdf' ? plan.pages : plan.docxPages, tier: plan.tier.name };
}

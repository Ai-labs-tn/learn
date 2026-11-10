import type { Profile } from '../portfolio/types';
import type { ResumePlan } from './layout';
import { sanitize, type ResumeBlock, type Run } from './model';
import { contentWidth, THEME } from './theme';
import { docTitle, topSkills } from './util';

const tw = (pt: number) => Math.round(pt * 20);

export async function renderDocx(profile: Profile, plan: ResumePlan): Promise<Uint8Array> {
  const d = await import('docx');
  const t = plan.tier;
  const font = THEME.fontFamilyDocx;
  const sizeOf = (kind: ResumeBlock['kind']) => plan.lines.find((l) => l.kind === kind)?.size ?? t.fontSize;
  const run = (r: Run, kind: ResumeBlock['kind'], size: number) => {
    const accent = kind === 'heading' || kind === 'name';
    const tr = new d.TextRun({ text: r.text, bold: !!r.bold, font, size: Math.round(size * 2), color: accent ? THEME.color.accent : THEME.color.text });
    return r.href ? new d.ExternalHyperlink({ link: r.href, children: [tr] }) : tr;
  };
  const paragraphs = plan.blocks.map((b, bi) => {
    const first = plan.lines.find((l) => l.block === bi)!;
    const last = [...plan.lines].reverse().find((l) => l.block === bi)!;
    const size = first.size;
    const children: (InstanceType<typeof d.TextRun> | InstanceType<typeof d.ExternalHyperlink>)[] = b.runs.map((r) => run(r, b.kind, size));
    if (b.kind === 'title' && b.date) {
      children.push(new d.TextRun({ children: [new d.Tab(), b.date], font, size: Math.round(size * 2), color: THEME.color.muted }));
    }
    return new d.Paragraph({
      children,
      alignment: first.center ? d.AlignmentType.CENTER : d.AlignmentType.LEFT,
      keepNext: first.keepNext || b.kind === 'heading',
      keepLines: true,
      spacing: { before: tw(first.before), after: tw(last.after), line: tw(first.lh), lineRule: d.LineRuleType.EXACT },
      tabStops: b.kind === 'title' ? [{ type: d.TabStopType.RIGHT, position: tw(contentWidth()) }] : undefined,
      border: b.kind === 'heading' ? { bottom: { style: d.BorderStyle.SINGLE, size: 6, space: 1, color: THEME.color.accent } } : undefined,
      numbering: b.kind === 'bullet' ? { reference: 'resume-bullets', level: 0 } : undefined,
    });
  });
  void sizeOf;
  const name = sanitize(profile.identity.name);
  const doc = new d.Document({
    creator: name,
    title: docTitle(profile),
    subject: `Resume of ${name}`,
    keywords: topSkills(profile).join(', '),
    description: 'Resume',
    styles: {
      default: {
        document: {
          run: { font, size: Math.round(t.fontSize * 2), color: THEME.color.text, language: { value: 'en-US' } },
          paragraph: { spacing: { before: 0, after: 0 } },
        },
      },
    },
    numbering: {
      config: [{
        reference: 'resume-bullets',
        levels: [{
          level: 0, format: d.LevelFormat.BULLET, text: '\u2022', alignment: d.AlignmentType.LEFT,
          style: { run: { font }, paragraph: { indent: { left: tw(THEME.textIndent), hanging: tw(THEME.textIndent - THEME.bulletIndent) } } },
        }],
      }],
    },
    sections: [{
      properties: {
        page: {
          size: { width: tw(THEME.page.width), height: tw(THEME.page.height) },
          margin: { top: tw(THEME.margin), bottom: tw(THEME.margin), left: tw(THEME.margin), right: tw(THEME.margin), header: 0, footer: 0 },
        },
      },
      children: paragraphs,
    }],
  });
  return new Uint8Array(await d.Packer.toArrayBuffer(doc));
}

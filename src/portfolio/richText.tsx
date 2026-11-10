import { Fragment, type ReactNode } from 'react';

/** The owner marks keywords as **bold** in resume.md; the page shows them bold, plain contexts drop the markers. */
export const stripMarks = (text: string) => text.replace(/\*\*/g, '');

export function RichText({ text }: { text: string }): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : <Fragment key={index}>{part}</Fragment>);
}

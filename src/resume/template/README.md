# Resume template

The downloadable resume (DOCX and PDF) is built from the owner's Word template `ResumeTemplate.docx`.

## Regenerate after editing the template

```powershell
npm run resume:template                              # reads ..\ResumeTemplate.docx
npm run resume:template -- --template D:\path\to\ResumeTemplate.docx
```

This rewrites two generated files here (do not edit them by hand):

- `template-data.ts` - the sanitised template as a base64 zip (custom XML, sensitivity labels, custom properties and author data removed, sample body removed, page size switched to A4, margins kept). The DOCX renderer fills `word/document.xml` of a copy of it.
- `spec.ts` - fonts, colours, sizes, spacing, margins, bullet indent and the name-rule colour/width read from the template's `styles.xml`, theme, numbering and section properties. The PDF renderer and the layout engine read the same values, so a changed accent colour or font size updates both formats without code changes.

`npm run resume:fonts` regenerates `../widths.ts` (Cambria advance widths, read from the Windows Cambria fonts when installed, otherwise Caladea) and `../fonts/fonts.ts` (Caladea, SIL OFL, embedded in the PDF).

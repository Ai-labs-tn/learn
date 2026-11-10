# Local tooling: regenerates sample, exports via Word, prints line-by-line baseline differences. Usage: .\scripts\resume-compare.ps1 [profile.json]
param([string]$Profile = 'src/portfolio/profile.snapshot.json', [int]$Rows = 400)
$o = 'C:\Users\sarav\AppData\Local\Temp\opencode'
node scripts/resume-sample.mjs $Profile "$o/tpl-resume"
powershell -File scripts/word-measure.ps1 -Docx "$o\tpl-resume.docx" -Pdf "$o\tpl-word.pdf" -Json "$o\word.json"
node scripts/pdf-lines.mjs "$o\tpl-word.pdf" > "$o\w.json"
node scripts/pdf-lines.mjs "$o\tpl-resume.pdf" > "$o\o.json"
$w = Get-Content "$o\w.json" -Raw | ConvertFrom-Json; $m = Get-Content "$o\o.json" -Raw | ConvertFrom-Json
"word lines=$($w.Count) ours lines=$($m.Count)"
for ($i = 0; $i -lt [Math]::Min($Rows, [Math]::Min($w.Count, $m.Count)); $i++) {
  $a = $w[$i]; $b = $m[$i]
  $flag = if ($a.page -ne $b.page) { 'PAGE' } elseif ([Math]::Abs($a.y - $b.y) -gt 2) { 'dy' } else { '' }
  '{0,3} W p{1} {2,6} | O p{3} {4,6} | d={5,5:N1} {6,-4} {7} || {8}' -f $i, $a.page, $a.y, $b.page, $b.y, ($b.y - $a.y), $flag, $a.text.Substring(0, [Math]::Min(26, $a.text.Length)), $b.text.Substring(0, [Math]::Min(26, $b.text.Length))
}

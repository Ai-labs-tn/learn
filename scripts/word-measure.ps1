# Local tooling (not CI): .\scripts\word-measure.ps1 -Docx in.docx -Pdf out.pdf -Json out.json
param([string]$Docx, [string]$Pdf, [string]$Json)
$w = New-Object -ComObject Word.Application
$w.Visible = $false
try {
  $d = $w.Documents.Open($Docx, $false, $true)
  $d.Repaginate()
  $paras = @()
  $i = 0
  foreach ($p in $d.Paragraphs) {
    $r = $p.Range; $r.Collapse(1)
    $paras += [pscustomobject]@{ i = $i; page = $r.Information(3); y = $r.Information(6); style = $p.Style.NameLocal; font = $p.Range.Font.Name; size = $p.Range.Font.Size; lines = $p.Range.ComputeStatistics(1); text = $p.Range.Text.Substring(0, [Math]::Min(40, $p.Range.Text.Length)) }
    $i++
  }
  $pages = $d.ComputeStatistics(2)
  if ($Pdf) { $d.ExportAsFixedFormat($Pdf, 17) }
  @{ pages = $pages; paras = $paras } | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 $Json
  $d.Close($false)
  "pages=$pages"
} finally { $w.Quit() }

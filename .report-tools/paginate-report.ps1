# เครื่องมือจัดรูปแบบและตรวจเอกสารรายงาน
$ErrorActionPreference = 'Stop'
$reportRoot = Split-Path -Parent $PSScriptRoot
$reportDir = Join-Path $reportRoot 'docs\เอกสารรายงาน\รายงานจากระบบจริง'
$reportFile = Join-Path $reportDir 'รายงานระบบจัดการโรงแรม-Hotel-Lobby.docx'
$reportPdf = Join-Path $reportRoot '.report-tools\qa\report.pdf'
New-Item -ItemType Directory -Path (Split-Path -Parent $reportPdf) -Force | Out-Null
Add-Type @'
using System.Runtime.InteropServices;
public class ReportFontLoader {
 [DllImport("gdi32.dll", CharSet=CharSet.Unicode)] public static extern int AddFontResourceEx(string name, uint flags, System.IntPtr res);
 [DllImport("gdi32.dll", CharSet=CharSet.Unicode)] public static extern bool RemoveFontResourceEx(string name, uint flags, System.IntPtr res);
}
'@
$reportFontFiles = Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'fonts') -Filter '*.ttf'
foreach ($font in $reportFontFiles) {
    $added = [ReportFontLoader]::AddFontResourceEx($font.FullName, 0, [IntPtr]::Zero)
    Write-Output ('Temporary font: ' + $font.Name + ' = ' + $added)
}
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
    $document = $word.Documents.Open($reportFile, $false, $false)
    try {
        $document.EmbedTrueTypeFonts = $true
        $document.SaveSubsetFonts = $false
        $document.Repaginate()
        $document.Fields.Update() | Out-Null
        for ($i = 1; $i -le $document.TablesOfContents.Count; $i++) {
            $document.TablesOfContents.Item($i).Update()
            $tocRange = $document.TablesOfContents.Item($i).Range
            $tocRange.Font.Name = 'TH SarabunPSK'
            $tocRange.Font.Size = 16
            $tocRange.Font.SizeBi = 16
            $tocRange.Font.Color = 0
            $tocRange.Font.Underline = 0
            $tocRange.ParagraphFormat.LineSpacingRule = 0
            $tocRange.ParagraphFormat.SpaceAfter = 6
        }
        $document.Repaginate()
        $document.Save()
        $document.ExportAsFixedFormat($reportPdf, 17)
        Write-Output ('Pages: ' + $document.ComputeStatistics(2))
        Write-Output ('QA PDF: ' + $reportPdf)
    } finally { $document.Close(0) }
} finally {
    $word.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    foreach ($font in $reportFontFiles) {
        [ReportFontLoader]::RemoveFontResourceEx($font.FullName, 0, [IntPtr]::Zero) | Out-Null
    }
}

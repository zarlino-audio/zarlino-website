# Builds a labeled contact sheet of the vee image set for visual QA. Pure ASCII.
Add-Type -AssemblyName System.Drawing
$dir = Join-Path $PSScriptRoot '..\public\images\vee'
$files = Get-ChildItem $dir -File -Include *.jpg -ErrorAction SilentlyContinue
$files = Get-ChildItem (Join-Path $dir '*.jpg') | Sort-Object Name
$cols = 5
$cellW = 300
$cellH = 220
$rows = [Math]::Ceiling($files.Count / $cols)
$sheet = New-Object System.Drawing.Bitmap ($cols * $cellW), ($rows * $cellH)
$g = [System.Drawing.Graphics]::FromImage($sheet)
$g.Clear([System.Drawing.Color]::FromArgb(20, 20, 24))
$font = New-Object System.Drawing.Font 'Consolas', 12
$brush = [System.Drawing.Brushes]::White
$i = 0
foreach ($f in $files) {
  $col = $i % $cols
  $row = [Math]::Floor($i / $cols)
  $x = $col * $cellW
  $y = $row * $cellH
  try {
    $img = [System.Drawing.Image]::FromFile($f.FullName)
    $scale = [Math]::Min(($cellW - 10) / $img.Width, ($cellH - 40) / $img.Height)
    $w = [int]($img.Width * $scale)
    $h = [int]($img.Height * $scale)
    $g.DrawImage($img, $x + 5, $y + 5, $w, $h)
    $img.Dispose()
  } catch {
    $g.DrawString('LOAD ERR', $font, $brush, $x + 5, $y + 5)
  }
  $g.DrawString($f.Name, $font, $brush, $x + 5, $y + $cellH - 26)
  $i++
}
$g.Dispose()
$out = Join-Path $dir '_contact-sheet.png'
$sheet.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$sheet.Dispose()
Write-Host "Saved $out ($($files.Count) images)"

# Downloads curated placeholder photography for the Vee Properties page.
# Pure ASCII. Run from anywhere: powershell -File tools/fetch-vee-images.ps1
$ErrorActionPreference = 'Continue'
$dir = Join-Path $PSScriptRoot '..\public\images\vee'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$map = [ordered]@{
  'hero-atrium.jpg'      = 'photo-1512917774080-9991f1c4c750'
  'listing-el1001.jpg'   = 'photo-1600596542815-ffad4c1539a9'
  'listing-cn3001.jpg'   = 'photo-1580587771525-78b9dba3b914'
  'listing-ap2001.jpg'   = 'photo-1545324418-cc1a3fa10c00'
  'listing-el1002.jpg'   = 'photo-1522708323590-d24dbb6b0267'
  'listing-ad6001.jpg'   = 'photo-1568605114967-8130f3a36994'
  'listing-os4001.jpg'   = 'photo-1502672260266-1c1ef2d93688'
  'listing-ra8001.jpg'   = 'photo-1560448204-e02f11c3d0e2'
  'listing-ro8002.jpg'   = 'photo-1493809842364-78817add7ffb'
  'nb-east-legon.jpg'    = 'photo-1449824913935-59a10b8d2000'
  'nb-cantonments.jpg'   = 'photo-1480714378408-67cf0d13bc1b'
  'nb-airport.jpg'       = 'photo-1477959858617-67f85cf4f1df'
  'nb-labone-osu.jpg'    = 'photo-1460317442991-0ec209397118'
  'nb-tema-adenta.jpg'   = 'photo-1523217582562-09d0def993a6'
  'interior-detail.jpg'  = 'photo-1600607687939-ce8a6c25118c'
}

$report = New-Object System.Collections.ArrayList
foreach ($k in $map.Keys) {
  $url = 'https://images.unsplash.com/' + $map[$k] + '?w=1200&q=72&fm=jpg&fit=crop'
  $dest = Join-Path $dir $k
  $ok = $false
  for ($attempt = 1; $attempt -le 3 -and -not $ok; $attempt++) {
    try {
      Invoke-WebRequest -Uri $url -OutFile $dest -TimeoutSec 30 -UseBasicParsing
      $ok = $true
    } catch {
      Start-Sleep -Milliseconds 2500
    }
  }
  if ($ok) {
    $sz = (Get-Item $dest).Length
    [void]$report.Add(('{0} OK {1}' -f $k, $sz))
  } else {
    [void]$report.Add(('{0} FAILED' -f $k))
  }
  Start-Sleep -Milliseconds 1200
}
$report | Set-Content -Path (Join-Path $PSScriptRoot 'vee-images-report.txt') -Encoding ascii
$report -join "`n"

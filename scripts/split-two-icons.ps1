param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [Parameter(Mandatory = $true)]
  [int]$KurzickId,

  [Parameter(Mandatory = $true)]
  [int]$LuxonId
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$outputDirectory = Join-Path $projectRoot 'public\skill-icons'

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

Add-Type -AssemblyName System.Drawing

$source = [System.Drawing.Bitmap]::new(
  (Resolve-Path $InputPath).Path
)
$width = $source.Width
$halfHeight = [int]($source.Height / 2)

if ($source.Height % 2 -ne 0) {
  $source.Dispose()
  throw "The image height ($($source.Height)) is odd, so it cannot be split evenly."
}

if ($width -ne $halfHeight) {
  Write-Warning "Each half is $width x $halfHeight pixels, not square. Check the source image for padding."
}

function Save-CroppedHalf {
  param(
    [System.Drawing.Bitmap]$Source,
    [int]$Y,
    [int]$Width,
    [int]$Height,
    [string]$OutputPath
  )

  $output = [System.Drawing.Bitmap]::new($Width, $Height)
  $graphics = [System.Drawing.Graphics]::FromImage($output)

  try {
    $sourceRectangle = [System.Drawing.Rectangle]::new(0, $Y, $Width, $Height)
    $destinationRectangle = [System.Drawing.Rectangle]::new(0, 0, $Width, $Height)

    $graphics.DrawImage(
      $Source,
      $destinationRectangle,
      $sourceRectangle,
      [System.Drawing.GraphicsUnit]::Pixel
    )

    $output.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $output.Dispose()
  }
}

$kurzickOutput = Join-Path $outputDirectory "$KurzickId.png"
$luxonOutput = Join-Path $outputDirectory "$LuxonId.png"

try {
  Save-CroppedHalf `
    -Source $source `
    -Y 0 `
    -Width $width `
    -Height $halfHeight `
    -OutputPath $kurzickOutput

  Save-CroppedHalf `
    -Source $source `
    -Y $halfHeight `
    -Width $width `
    -Height $halfHeight `
    -OutputPath $luxonOutput
} finally {
  $source.Dispose()
}

Write-Host "Created Kurzick icon: $kurzickOutput"
Write-Host "Created Luxon icon:   $luxonOutput"
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$dataPath = Join-Path $projectRoot 'src\data\skills.json'
$outputDirectory = Join-Path $projectRoot 'public\skill-icons'
$reportPath = Join-Path $projectRoot 'skill-icon-download-report.csv'

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

$skillData = Get-Content -Raw -Path $dataPath | ConvertFrom-Json
$skills = $skillData.skills
# $skills = @(
#   $skillData.skills | Where-Object { $_.id -eq 13 }
# )


if (-not $skills -or $skills.Count -eq 0) {
  throw "No skills were found in $dataPath"
}

$wikiApi = 'https://wiki.guildwars.com/api.php'
$headers = @{
  'User-Agent' = 'GW-Skilldle icon downloader (personal project; contact: local)'
}

$report = [System.Collections.Generic.List[object]]::new()

function Get-WikiJson {
  param(
    [hashtable]$Query
  )

  $queryText = ($Query.GetEnumerator() | ForEach-Object {
    '{0}={1}' -f `
      [uri]::EscapeDataString([string]$_.Key), `
      [uri]::EscapeDataString([string]$_.Value)
  }) -join '&'

  $url = "$wikiApi`?$queryText"

  return Invoke-RestMethod `
    -Uri $url `
    -Headers $headers `
    -Method Get `
    -TimeoutSec 30
}

function Find-SkillIconUrl {
  param(
    [string]$SkillName
  )

  $pageQuery = @{
    action = 'query'
    format = 'json'
    formatversion = '2'
    prop = 'images'
    imlimit = 'max'
    titles = $SkillName
  }

  $pageResponse = Get-WikiJson -Query $pageQuery
  $page = $pageResponse.query.pages | Select-Object -First 1

  if (-not $page -or $page.missing -or -not $page.images) {
    return $null
  }

  $normalizedName = $SkillName.ToLowerInvariant()
  $candidate = $page.images |
    Where-Object {
      $_.title -match '^File:' -and
      $_.title.ToLowerInvariant() -match [regex]::Escape($normalizedName)
    } |
    Select-Object -First 1

  if (-not $candidate) {
    return $null
  }

  $fileQuery = @{
    action = 'query'
    format = 'json'
    formatversion = '2'
    prop = 'imageinfo'
    iiprop = 'url'
    iiurlwidth = '64'
    titles = $candidate.title
  }

  $fileResponse = Get-WikiJson -Query $fileQuery
  $filePage = $fileResponse.query.pages | Select-Object -First 1
  $imageInfo = $filePage.imageinfo | Select-Object -First 1

  if (-not $imageInfo) {
    return $null
  }

  if ($imageInfo.thumburl) {
    return $imageInfo.thumburl
  }

  return $imageInfo.url
}

$total = @($skills).Count
$current = 0

if ($total -eq 0) {
  throw 'No skills matched the current filter. Check the ID/name filter before downloading.'
}

foreach ($skill in $skills) {
  $current += 1

  $id = [int]$skill.id
  $name = [string]$skill.name
  $outputPath = Join-Path $outputDirectory "$id.png"

  Write-Progress `
    -Activity 'Downloading Guild Wars skill icons' `
    -Status "[$current / $total] $name" `
    -PercentComplete (($current / $total) * 100)

  if (Test-Path $outputPath) {
    $report.Add([pscustomobject]@{
      Id = $id
      Name = $name
      Status = 'SkippedExisting'
      SourceUrl = ''
      File = $outputPath
      Error = ''
    })

    continue
  }

  try {
    $iconUrl = Find-SkillIconUrl -SkillName $name

    if (-not $iconUrl) {
      $report.Add([pscustomobject]@{
        Id = $id
        Name = $name
        Status = 'NotFound'
        SourceUrl = ''
        File = ''
        Error = 'No matching image found on the skill page'
      })

      Start-Sleep -Milliseconds 750
      continue
    }

    Invoke-WebRequest `
      -Uri $iconUrl `
      -Headers $headers `
      -OutFile $outputPath `
      -TimeoutSec 60

    $report.Add([pscustomobject]@{
      Id = $id
      Name = $name
      Status = 'Downloaded'
      SourceUrl = $iconUrl
      File = $outputPath
      Error = ''
    })
  } catch {
    $report.Add([pscustomobject]@{
      Id = $id
      Name = $name
      Status = 'Failed'
      SourceUrl = ''
      File = ''
      Error = $_.Exception.Message
    })
  }

  Start-Sleep -Milliseconds 750
}

$report | Export-Csv -Path $reportPath -NoTypeInformation -Encoding utf8

$downloaded = @($report | Where-Object Status -eq 'Downloaded').Count
$skipped = @($report | Where-Object Status -eq 'SkippedExisting').Count
$notFound = @($report | Where-Object Status -eq 'NotFound').Count
$failed = @($report | Where-Object Status -eq 'Failed').Count

Write-Host ''
Write-Host "Done."
Write-Host "Downloaded: $downloaded"
Write-Host "Already present: $skipped"
Write-Host "Not found: $notFound"
Write-Host "Failed: $failed"
Write-Host "Report: $reportPath"
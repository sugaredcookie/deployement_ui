$applicationsFolder = Join-Path $PSScriptRoot "applications"

$files = Get-ChildItem $applicationsFolder -Filter "*.csv" |
    Select-Object -ExpandProperty Name

$files |
    ConvertTo-Json |
    Set-Content (Join-Path $applicationsFolder "index.json")

Write-Host "index.json updated with $($files.Count) CSV files"

$AppFolder = Join-Path $PSScriptRoot "App"

$file = Get-ChildItem $AppFolder -Filter "*.yml" |
    Select-Object -ExpandProperty Name

$file |
    ConvertTo-Json |
    Set-Content (Join-Path $AppFolder "index.json")

Write-Host "index.json updated with $($files.Count) YAML files"
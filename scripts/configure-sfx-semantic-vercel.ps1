[CmdletBinding()]
param(
  [switch]$Configure,
  [switch]$RunCanary,
  [string]$Branch = 'infrastructure-improvs-+Editron',
  [string]$CredentialPath = (
    Join-Path ([IO.Path]::GetTempPath()) 'editron-sfx-semantic-canary-credentials.dpapi'
  )
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'

$ExpectedProjectId = 'prj_uAwH5pAHMWaOiRNbS7FZuejWXUuc'
$ExpectedOrgId = 'team_I1KWlM0rMN13dmFCVxzKSODS'
$ExpectedAppName = 'editron-sfx-semantic-canary'
$SemanticUrl = 'https://jainnimit728--editron-sfx-semantic-canary-serve.modal.run/v1/query'
$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$ProjectFile = Join-Path $RepoRoot '.vercel/project.json'
$RuntimeManifestPath = Join-Path $RepoRoot 'public/sfx/manifest.json'

function Invoke-Vercel {
  param(
    [Parameter(Mandatory)][string[]]$Arguments,
    [string]$InputValue
  )

  $previousErrorActionPreference = $ErrorActionPreference
  $output = @()
  $exitCode = 1
  try {
    $ErrorActionPreference = 'Continue'
    if ($PSBoundParameters.ContainsKey('InputValue')) {
      $output = @($InputValue | & vercel @Arguments 2>&1)
    } else {
      $output = @(& vercel @Arguments 2>&1)
    }
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($exitCode -ne 0) {
    throw "vercel $($Arguments -join ' ') failed: $($output -join [Environment]::NewLine)"
  }
  return $output
}

function Get-RequiredString {
  param(
    [Parameter(Mandatory)]$Object,
    [Parameter(Mandatory)][string]$Name
  )

  $property = $Object.PSObject.Properties[$Name]
  if (-not $property -or -not ($property.Value -is [string])) {
    throw "Encrypted credential payload is missing $Name"
  }
  $value = ([string]$property.Value).Trim()
  if (-not $value) {
    throw "Encrypted credential payload contains an empty $Name"
  }
  return $value
}

function Read-ProtectedCredentials {
  if (-not (Test-Path -LiteralPath $CredentialPath -PathType Leaf)) {
    throw "Encrypted credential payload is missing: $CredentialPath"
  }
  $encrypted = (Get-Content -LiteralPath $CredentialPath -Raw).Trim()
  if (-not $encrypted) {
    throw 'Encrypted credential payload is empty'
  }

  $securePayload = ConvertTo-SecureString $encrypted
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePayload)
  try {
    $payloadJson = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    return $payloadJson | ConvertFrom-Json
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Assert-LinkedProject {
  if (-not (Test-Path -LiteralPath $ProjectFile -PathType Leaf)) {
    throw "Vercel project link is missing: $ProjectFile"
  }
  $project = Get-Content -LiteralPath $ProjectFile -Raw | ConvertFrom-Json
  if (
    $project.projectId -ne $ExpectedProjectId -or
    $project.orgId -ne $ExpectedOrgId
  ) {
    throw 'Refusing to configure an unexpected Vercel project or team'
  }
}

function Assert-RuntimeSemanticCatalog {
  if (-not (Test-Path -LiteralPath $RuntimeManifestPath -PathType Leaf)) {
    throw "Runtime SFX manifest is missing: $RuntimeManifestPath"
  }
  $manifest = Get-Content -LiteralPath $RuntimeManifestPath -Raw | ConvertFrom-Json
  $entries = @($manifest.entries)
  if ($entries.Count -eq 0) {
    throw 'Runtime SFX manifest contains no catalog entries'
  }
  $missingSemanticEvidence = @($entries | Where-Object {
    $property = $_.PSObject.Properties['semanticEvidence']
    -not $property -or $null -eq $property.Value
  })
  if ($missingSemanticEvidence.Count -gt 0) {
    $message = 'Refusing semantic Vercel configuration: {0}/{1} runtime SFX entries lack semantic evidence' -f $missingSemanticEvidence.Count, $entries.Count
    throw $message
  }
  Write-Output "RUNTIME_SEMANTIC_CATALOG_READY=$($entries.Count)"
}

function Get-SemanticVariables {
  $payload = Read-ProtectedCredentials
  $appName = Get-RequiredString $payload 'appName'
  $retrievalToken = Get-RequiredString $payload 'retrievalToken'
  $proxyTokenId = Get-RequiredString $payload 'modalProxyTokenId'
  $proxyTokenSecret = Get-RequiredString $payload 'modalProxyTokenSecret'

  if ($appName -ne $ExpectedAppName) {
    throw "Credential payload belongs to unexpected Modal app: $appName"
  }
  if ($retrievalToken.Length -lt 32) {
    throw 'Semantic retrieval token is shorter than 32 characters'
  }
  if ($proxyTokenId -notmatch '^wk-[A-Za-z0-9_-]{8,}$') {
    throw 'Modal proxy token ID has the wrong credential class'
  }
  if ($proxyTokenSecret -notmatch '^ws-[A-Za-z0-9_-]{8,}$') {
    throw 'Modal proxy token secret has the wrong credential class'
  }

  return [ordered]@{
    SFX_SEMANTIC_RETRIEVAL_URL = $SemanticUrl
    SFX_SEMANTIC_RETRIEVAL_TOKEN = $retrievalToken
    SFX_SEMANTIC_MODAL_PROXY_TOKEN_ID = $proxyTokenId
    SFX_SEMANTIC_MODAL_PROXY_TOKEN_SECRET = $proxyTokenSecret
  }
}

function Assert-BranchVariablesListed {
  param([Parameter(Mandatory)]$Variables)

  $listing = (Invoke-Vercel -Arguments @(
    '--no-color',
    'env',
    'list',
    'preview',
    $Branch
  )) -join "`n"
  foreach ($name in $Variables.Keys) {
    if ($listing -notmatch [regex]::Escape([string]$name)) {
      throw "Vercel did not list required branch variable: $name"
    }
  }
}

function Set-BranchVariables {
  $variables = Get-SemanticVariables
  foreach ($entry in $variables.GetEnumerator()) {
    Invoke-Vercel -Arguments @(
      '--no-color',
      'env',
      'add',
      $entry.Key,
      'preview',
      $Branch,
      '--sensitive',
      '--force',
      '--yes'
    ) -InputValue ([string]$entry.Value) | Out-Null
    Write-Output "VERCEL_PREVIEW_VARIABLE_SET=$($entry.Key)"
  }

  Assert-BranchVariablesListed $variables
  Write-Output "VERCEL_BRANCH_CONFIGURED=$Branch"
}

function Invoke-SemanticRenderCanary {
  $variables = Get-SemanticVariables
  Assert-BranchVariablesListed $variables
  $variables['SFX_RENDER_CANARY_REQUIRE_SEMANTIC'] = '1'
  $previousValues = @{}
  $previousErrorActionPreference = $ErrorActionPreference
  $output = @()
  $exitCode = 1
  try {
    foreach ($entry in $variables.GetEnumerator()) {
      $previousValues[$entry.Key] = [Environment]::GetEnvironmentVariable(
        $entry.Key,
        'Process'
      )
      [Environment]::SetEnvironmentVariable(
        $entry.Key,
        [string]$entry.Value,
        'Process'
      )
    }
    $ErrorActionPreference = 'Continue'
    $output = @(& npx 'tsx' 'scripts/run-sfx-render-canary.ts' 2>&1)
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
    foreach ($entry in $variables.GetEnumerator()) {
      [Environment]::SetEnvironmentVariable(
        $entry.Key,
        $previousValues[$entry.Key],
        'Process'
      )
    }
  }
  if ($exitCode -ne 0) {
    throw "SFX render canary failed: $($output -join [Environment]::NewLine)"
  }
  $output | ForEach-Object { Write-Output $_ }
}

if (-not $Configure -and -not $RunCanary) {
  throw 'Specify -Configure, -RunCanary, or both'
}

Assert-LinkedProject
Assert-RuntimeSemanticCatalog

if ($Configure) {
  Set-BranchVariables
}

if ($RunCanary) {
  Invoke-SemanticRenderCanary
}

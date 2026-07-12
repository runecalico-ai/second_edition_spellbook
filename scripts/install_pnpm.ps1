if (Get-Command pnpm -ErrorAction SilentlyContinue) {
  Write-Host "pnpm is available."
}
else {
  Write-Host "pnpm is missing, installing now..."
  Invoke-WebRequest https://get.pnpm.io/install.ps1 -UseBasicParsing | Invoke-Expression
}

# npm install -g pnpm@10
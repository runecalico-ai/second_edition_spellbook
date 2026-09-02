# Check if bun is installed
if (Get-Command bun -ErrorAction SilentlyContinue) {
  Write-Host "bun is available."
}
else {
  Write-Host "bun is missing, installing now..."
  # Check if bun is installed using scoop list
  # if not installed then install it using scoop
  if (scoop list bun | Select-String "bun") {
    Write-Host "bun is already installed."
  }
  else {
    Write-Host "bun is not installed, installing now..."
    scoop install bun
  }
}
# Check if fnm is installed
if (Get-Command fnm -ErrorAction SilentlyContinue) {
  Write-Host "fnm is available."
}
else {
  Write-Host "fnm is missing, installing now..."
  # Check if fnm is installed using scoop list
  # if not installed then install it using scoop
  if (scoop list fnm | Select-String "fnm") {
    Write-Host "fnm is already installed."
  }
  else {
    Write-Host "fnm is not installed, installing now..."
    scoop install fnm
  }
}
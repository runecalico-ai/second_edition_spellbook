# Check if ripgrep is installed
if (Get-Command ripgrep -ErrorAction SilentlyContinue) {
  Write-Host "ripgrep is available."
}
else {
  Write-Host "ripgrep is missing, installing now..."
  # Check if ripgrep is installed using scoop list
  # if not installed then install it using scoop
  if (scoop list ripgrep | Select-String "ripgrep") {
    Write-Host "ripgrep is already installed."
  }
  else {
    Write-Host "ripgrep is not installed, installing now..."
    scoop install ripgrep
  }
}
# Check if uv is installed
if (Get-Command uv -ErrorAction SilentlyContinue) {
  Write-Host "uv is available."
}
else {
  Write-Host "uv is missing, installing now..."
  # Check if uv is installed using scoop list
  # if not installed then install it using scoop
  if (scoop list uv | Select-String "uv") {
    Write-Host "uv is already installed."
  }
  else {
    Write-Host "uv is not installed, installing now..."
    scoop install uv
  }
}
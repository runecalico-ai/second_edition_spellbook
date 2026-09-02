if (Get-Command scoop -ErrorAction SilentlyContinue) {
  Write-Host "Scoop is available."
}
else {
  Write-Host "Scoop is missing, installing now..."
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
  Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
}
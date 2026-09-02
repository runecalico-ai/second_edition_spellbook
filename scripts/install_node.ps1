fnm env --use-on-cd | Out-String | Invoke-Expression
# Using fnm check if node 24.18.0 is installed using fnm list
if (fnm list | Select-String "24.18.0") {
  Write-Host "node 24.18.0 is already installed."
}
else {
  Write-Host "node 24.18.0 is missing, installing now..."
  fnm install 24.18.0
}

# Using fnm use 24.18.0 to use it
fnm use 24.18.0
# Check to see if rustup is already installed
# if it is not then install it.
if (Get-Command rustup -ErrorAction SilentlyContinue) {
  Write-Host "rustup is available."
}
else {
  Write-Host "rustup is missing, installing now..."
  # Download https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe
  Invoke-WebRequest https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe -OutFile rustup-init.exe
  # Install Rust
  Start-Process -FilePath .\rustup-init.exe -ArgumentList "-y" -Wait
  # Remove the installer
  Remove-Item .\rustup-init.exe
}
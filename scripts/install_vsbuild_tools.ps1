
Invoke-WebRequest -Uri "https://aka.ms/vs/stable/vs_BuildTools.exe" -OutFile "$env:TEMP\vs_buildtools.exe"

# 2022 - https://aka.ms/vs/17/release/vs_buildtools.exe
Invoke-WebRequest -Uri "https://aka.ms/vs/17/release/vs_buildtools.exe" -OutFile "$env:TEMP\vs_buildtools.exe"

Start-Process -FilePath "$env:TEMP\vs_BuildTools.exe" -Wait -PassThru -ArgumentList `
"--add Microsoft.VisualStudio.Workload.VCTools", `
"--add Microsoft.VisualStudio.Workload.ManagedDesktopBuildTools", `
"--add Microsoft.VisualStudio.Component.TestTools.BuildTools", `
"--add Microsoft.VisualStudio.Component.VC.14.44.17.14.x86.x64", `
"--add Microsoft.VisualStudio.Component.VC.ASAN", `
"--add Microsoft.VisualStudio.Component.VC.CMake.Project", `
"--add Microsoft.VisualStudio.Component.VC.Tools.x86.x64", `
"--add Microsoft.VisualStudio.Component.Vcpkg", `
"--add Microsoft.VisualStudio.Component.Windows11SDK.26100", `
"--add Microsoft.VisualStudio.Workload.LinuxBuildTools", `
"--passive", "--norestart", "--wait"




Set-ItemProperty -Path "HKLM:\System\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1
#winget install --id Microsoft.VisualStudio.2026.BuildTools --silent --override "--wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
winget install -e --id LLVM.LLVM

# Reboot is required to complete the installation of Visual Studio Build Tools. Please reboot your system to ensure all components are properly configured.
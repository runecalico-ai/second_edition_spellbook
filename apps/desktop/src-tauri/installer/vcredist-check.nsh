; Spellbook links the dynamic MSVC CRT (see src-tauri/.cargo/config.toml and
; src-tauri/AGENTS.md, "CRT linkage on Windows") so it shares one allocator with
; every vendored native dependency. That means the installed exe depends on the
; end-user machine already having the Microsoft Visual C++ Redistributable
; (x64) present, rather than embedding it. This hook only checks and warns; it
; does not install anything.
!macro NSIS_HOOK_PREINSTALL
  SetRegView 64
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64" "Installed"
  IntCmp $0 1 vcredist_present
    MessageBox MB_OK|MB_ICONEXCLAMATION "Spellbook requires the Microsoft Visual C++ Redistributable (x64), which was not detected on this system.$\r$\n$\r$\nPlease download and install it from https://aka.ms/vs/17/release/vc_redist.x64.exe, then run this installer again."
  vcredist_present:
!macroend

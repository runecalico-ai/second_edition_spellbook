use crate::db::pool::app_data_dir;
use crate::error::AppError;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use sysinfo::{Disks, System};

pub const BASELINE_MIN_FREE_RAM_BYTES: u64 = 1_610_612_736;
pub const BASELINE_MIN_FREE_DISK_BYTES: u64 = 800 * 1024 * 1024;

pub const TINY_LLAMA_URL: &str = "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf";
pub const TINY_LLAMA_SHA256: &str =
    "9FECC3B3CD76BBA89D504F29B616EEDF7DA85B96540E490CA5824D3F7D2776A0";
pub const TINY_LLAMA_SIZE_BYTES: u64 = 668_788_096;
pub const TINY_LLAMA_PEAK_RAM_BYTES: u64 = 910_843_904;
pub const TINY_LLAMA_DESTINATION: &str = "tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf";

pub const EMBEDDING_URL: &str = "https://huggingface.co/Qdrant/all-MiniLM-L6-v2-onnx/tree/5f1b8cd78bc4fb444dd171e59b18f3a3af89a079";
pub const EMBEDDING_MANIFEST_SHA: &str = "5f1b8cd78bc4fb444dd171e59b18f3a3af89a079";
pub const EMBEDDING_SIZE_BYTES: u64 = 91_102_069;
pub const EMBEDDING_PEAK_RAM_BYTES: u64 = 121_024_512;
pub const EMBEDDING_DESTINATION: &str = "embeddings/all-MiniLM-L6-v2/";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProvisioningTarget {
    Llm,
    Embeddings,
}

impl ProvisioningTarget {
    fn label(self) -> &'static str {
        match self {
            Self::Llm => "LLM",
            Self::Embeddings => "embeddings",
        }
    }

    pub fn approved_asset(self) -> &'static ApprovedModelAsset {
        match self {
            Self::Llm => &TINY_LLAMA_ASSET,
            Self::Embeddings => &EMBEDDING_ASSET,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ExpectedFile {
    pub relative_path: &'static str,
    pub size_bytes: u64,
    pub sha256: &'static str,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AssetHashStrategy {
    SingleFileSha256 {
        sha256: &'static str,
    },
    ArchiveSha256AndFileInventory {
        archive_sha256: &'static str,
        files: &'static [ExpectedFile],
    },
    FileInventoryOnly {
        files: &'static [ExpectedFile],
        manifest_sha: &'static str,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiskFootprint {
    SingleFile,
    Archive { staged_bytes: Option<u64> },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ResourceSnapshot {
    pub free_disk_bytes: u64,
    pub free_ram_bytes: u64,
}

pub trait ResourceProbe {
    fn snapshot(&self) -> Result<ResourceSnapshot, AppError>;
}

#[derive(Debug, Clone)]
pub struct LiveResourceProbe {
    models_dir: PathBuf,
}

impl LiveResourceProbe {
    pub fn new(models_dir: PathBuf) -> Self {
        Self { models_dir }
    }
}

impl ResourceProbe for LiveResourceProbe {
    fn snapshot(&self) -> Result<ResourceSnapshot, AppError> {
        let mut system = System::new();
        system.refresh_memory();

        let disk_path = self
            .models_dir
            .ancestors()
            .find(|path| path.exists())
            .unwrap_or(self.models_dir.as_path());
        let disks = Disks::new_with_refreshed_list();
        let free_disk_bytes = disks
            .iter()
            .filter(|disk| disk_path.starts_with(disk.mount_point()))
            .max_by_key(|disk| disk.mount_point().components().count())
            .map(|disk| disk.available_space())
            .ok_or_else(|| {
                AppError::Validation(format!(
                    "Unable to determine free disk space for {}",
                    self.models_dir.display()
                ))
            })?;

        Ok(ResourceSnapshot {
            free_disk_bytes,
            free_ram_bytes: system.available_memory(),
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FixedResourceProbe {
    snapshot: ResourceSnapshot,
}

impl FixedResourceProbe {
    pub const fn new(snapshot: ResourceSnapshot) -> Self {
        Self { snapshot }
    }
}

impl ResourceProbe for FixedResourceProbe {
    fn snapshot(&self) -> Result<ResourceSnapshot, AppError> {
        Ok(self.snapshot)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ApprovedModelAsset {
    pub target: ProvisioningTarget,
    pub source_url: &'static str,
    pub destination: &'static str,
    pub download_size_bytes: u64,
    pub installed_size_bytes: u64,
    pub disk_footprint: DiskFootprint,
    pub peak_ram_bytes: u64,
    pub hash_strategy: AssetHashStrategy,
}

pub const TINY_LLAMA_EXPECTED_FILES: [ExpectedFile; 1] = [ExpectedFile {
    relative_path: TINY_LLAMA_DESTINATION,
    size_bytes: TINY_LLAMA_SIZE_BYTES,
    sha256: TINY_LLAMA_SHA256,
}];

pub const EMBEDDING_EXPECTED_FILES: [ExpectedFile; 5] = [
    ExpectedFile {
        relative_path: "embeddings/all-MiniLM-L6-v2/model.onnx",
        size_bytes: 90_387_630,
        sha256: "bbd7b466f6d58e646fdc2bd5fd67b2f5e93c0b687011bd4548c420f7bd46f0c5",
    },
    ExpectedFile {
        relative_path: "embeddings/all-MiniLM-L6-v2/tokenizer.json",
        size_bytes: 711_661,
        sha256: "da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0",
    },
    ExpectedFile {
        relative_path: "embeddings/all-MiniLM-L6-v2/config.json",
        size_bytes: 650,
        sha256: "1b4d8e2a3988377ed8b519a31d8d31025a25f1c5f8606998e8014111438efcd7",
    },
    ExpectedFile {
        relative_path: "embeddings/all-MiniLM-L6-v2/special_tokens_map.json",
        size_bytes: 695,
        sha256: "5d5b662e421ea9fac075174bb0688ee0d9431699900b90662acd44b2a350503a",
    },
    ExpectedFile {
        relative_path: "embeddings/all-MiniLM-L6-v2/tokenizer_config.json",
        size_bytes: 1_433,
        sha256: "bd2e06a5b20fd1b13ca988bedc8763d332d242381b4fbc98f8fead4524158f79",
    },
];

pub const TINY_LLAMA_ASSET: ApprovedModelAsset = ApprovedModelAsset {
    target: ProvisioningTarget::Llm,
    source_url: TINY_LLAMA_URL,
    destination: TINY_LLAMA_DESTINATION,
    download_size_bytes: TINY_LLAMA_SIZE_BYTES,
    installed_size_bytes: TINY_LLAMA_SIZE_BYTES,
    disk_footprint: DiskFootprint::SingleFile,
    peak_ram_bytes: TINY_LLAMA_PEAK_RAM_BYTES,
    hash_strategy: AssetHashStrategy::SingleFileSha256 {
        sha256: TINY_LLAMA_SHA256,
    },
};

pub const EMBEDDING_ASSET: ApprovedModelAsset = ApprovedModelAsset {
    target: ProvisioningTarget::Embeddings,
    source_url: EMBEDDING_URL,
    destination: EMBEDDING_DESTINATION,
    download_size_bytes: EMBEDDING_SIZE_BYTES,
    installed_size_bytes: EMBEDDING_SIZE_BYTES,
    disk_footprint: DiskFootprint::Archive {
        staged_bytes: Some(0),
    },
    peak_ram_bytes: EMBEDDING_PEAK_RAM_BYTES,
    hash_strategy: AssetHashStrategy::FileInventoryOnly {
        files: &EMBEDDING_EXPECTED_FILES,
        manifest_sha: EMBEDDING_MANIFEST_SHA,
    },
};

#[derive(Debug, Default)]
pub struct ProvisioningState {
    active_target: Arc<Mutex<Option<ProvisioningTarget>>>,
}

impl ProvisioningState {
    pub fn start_download(
        &self,
        target: ProvisioningTarget,
    ) -> Result<ProvisioningLease, AppError> {
        let mut active_target = self
            .active_target
            .lock()
            .map_err(|_| AppError::Unknown("Provisioning state is poisoned".to_string()))?;

        match *active_target {
            None => *active_target = Some(target),
            Some(current) if current == target => {
                return Err(AppError::Validation(format!(
                    "Provisioning for {} is already in progress.",
                    target.label()
                )));
            }
            Some(current) => {
                return Err(AppError::Validation(format!(
                    "Provisioning for {} is unavailable while {} is in progress.",
                    target.label(),
                    current.label()
                )));
            }
        }

        drop(active_target);
        Ok(ProvisioningLease {
            active_target: Arc::clone(&self.active_target),
            target,
        })
    }
}

#[derive(Debug)]
pub struct ProvisioningLease {
    active_target: Arc<Mutex<Option<ProvisioningTarget>>>,
    target: ProvisioningTarget,
}

impl Drop for ProvisioningLease {
    fn drop(&mut self) {
        if let Ok(mut active_target) = self.active_target.lock() {
            if *active_target == Some(self.target) {
                *active_target = None;
            }
        }
    }
}

pub fn required_free_disk_bytes(asset: &ApprovedModelAsset) -> u64 {
    let required_bytes = match asset.disk_footprint {
        DiskFootprint::SingleFile => asset.installed_size_bytes,
        DiskFootprint::Archive { staged_bytes } => {
            staged_bytes.unwrap_or(asset.download_size_bytes) + asset.installed_size_bytes
        }
    };

    BASELINE_MIN_FREE_DISK_BYTES.max(required_bytes)
}

pub fn required_free_ram_bytes(asset: &ApprovedModelAsset) -> u64 {
    BASELINE_MIN_FREE_RAM_BYTES.max(asset.peak_ram_bytes)
}

pub fn ensure_resources_available<P: ResourceProbe>(
    probe: &P,
    asset: &ApprovedModelAsset,
    models_dir: &Path,
) -> Result<ResourceSnapshot, AppError> {
    let resources = probe.snapshot()?;
    let required_disk_bytes = required_free_disk_bytes(asset);
    if resources.free_disk_bytes < required_disk_bytes {
        return Err(AppError::Validation(format!(
            "Provisioning for {} requires at least {} free disk bytes in {} but only {} are available.",
            asset.target.label(),
            required_disk_bytes,
            models_dir.display(),
            resources.free_disk_bytes
        )));
    }

    let required_ram_bytes = required_free_ram_bytes(asset);
    if resources.free_ram_bytes < required_ram_bytes {
        return Err(AppError::Validation(format!(
            "Provisioning for {} requires at least {} free RAM bytes but only {} are available.",
            asset.target.label(),
            required_ram_bytes,
            resources.free_ram_bytes
        )));
    }

    Ok(resources)
}

pub fn models_dir(vault_root: &Path) -> PathBuf {
    vault_root.join("models")
}

pub fn app_models_dir() -> Result<PathBuf, AppError> {
    Ok(models_dir(&app_data_dir()?))
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_FILES: [ExpectedFile; 1] = [ExpectedFile {
        relative_path: "models/test.bin",
        size_bytes: 1,
        sha256: "abc123",
    }];

    fn test_asset(
        target: ProvisioningTarget,
        download_size_bytes: u64,
        installed_size_bytes: u64,
        disk_footprint: DiskFootprint,
        ram_bytes: u64,
        hash_strategy: AssetHashStrategy,
    ) -> ApprovedModelAsset {
        ApprovedModelAsset {
            target,
            source_url: "https://example.invalid/model",
            destination: "models/test.bin",
            download_size_bytes,
            installed_size_bytes,
            disk_footprint,
            peak_ram_bytes: ram_bytes,
            hash_strategy,
        }
    }

    #[test]
    fn guard_blocks_same_target_while_lease_live() {
        let state = ProvisioningState::default();
        let _lease = state.start_download(ProvisioningTarget::Llm).unwrap();

        let err = state.start_download(ProvisioningTarget::Llm).unwrap_err();
        assert!(
            matches!(err, AppError::Validation(message) if message.contains("already in progress"))
        );
    }

    #[test]
    fn guard_blocks_second_target_while_first_lease_live() {
        let state = ProvisioningState::default();
        let _lease = state.start_download(ProvisioningTarget::Llm).unwrap();

        let err = state
            .start_download(ProvisioningTarget::Embeddings)
            .unwrap_err();
        assert!(
            matches!(err, AppError::Validation(message) if message.contains("unavailable while LLM is in progress"))
        );
    }

    #[test]
    fn dropping_lease_releases_slot() {
        let state = ProvisioningState::default();
        let lease = state.start_download(ProvisioningTarget::Llm).unwrap();
        drop(lease);

        let lease = state.start_download(ProvisioningTarget::Llm).unwrap();
        drop(lease);
    }

    #[test]
    fn single_file_threshold_uses_installed_size_only() {
        assert_eq!(
            required_free_disk_bytes(&TINY_LLAMA_ASSET),
            BASELINE_MIN_FREE_DISK_BYTES
        );

        let asset = test_asset(
            ProvisioningTarget::Llm,
            BASELINE_MIN_FREE_DISK_BYTES + 99,
            BASELINE_MIN_FREE_DISK_BYTES + 17,
            DiskFootprint::SingleFile,
            BASELINE_MIN_FREE_RAM_BYTES,
            AssetHashStrategy::SingleFileSha256 { sha256: "abc123" },
        );

        assert_eq!(
            required_free_disk_bytes(&asset),
            BASELINE_MIN_FREE_DISK_BYTES + 17
        );
    }

    #[test]
    fn archive_threshold_uses_staged_bytes_plus_installed_size_when_present() {
        let asset = test_asset(
            ProvisioningTarget::Embeddings,
            BASELINE_MIN_FREE_DISK_BYTES + 900,
            17,
            DiskFootprint::Archive {
                staged_bytes: Some(BASELINE_MIN_FREE_DISK_BYTES + 33),
            },
            BASELINE_MIN_FREE_RAM_BYTES,
            AssetHashStrategy::FileInventoryOnly {
                files: &TEST_FILES,
                manifest_sha: "manifest-sha",
            },
        );

        assert_eq!(
            required_free_disk_bytes(&asset),
            BASELINE_MIN_FREE_DISK_BYTES + 50
        );
    }

    #[test]
    fn archive_one_byte_below_threshold_returns_validation_error() {
        let asset = test_asset(
            ProvisioningTarget::Embeddings,
            BASELINE_MIN_FREE_DISK_BYTES + 64,
            32,
            DiskFootprint::Archive { staged_bytes: None },
            BASELINE_MIN_FREE_RAM_BYTES,
            AssetHashStrategy::FileInventoryOnly {
                files: &TEST_FILES,
                manifest_sha: "manifest-sha",
            },
        );
        let required_disk_bytes = required_free_disk_bytes(&asset);
        let probe = FixedResourceProbe::new(ResourceSnapshot {
            free_disk_bytes: required_disk_bytes - 1,
            free_ram_bytes: BASELINE_MIN_FREE_RAM_BYTES,
        });

        let err = ensure_resources_available(&probe, &asset, Path::new("C:/models")).unwrap_err();
        assert!(
            matches!(err, AppError::Validation(message) if message.contains("free disk bytes"))
        );
    }

    #[test]
    fn ram_threshold_ignores_download_and_install_sizes_when_peak_ram_is_lower() {
        assert_eq!(
            required_free_ram_bytes(&TINY_LLAMA_ASSET),
            BASELINE_MIN_FREE_RAM_BYTES
        );

        let lower_peak_ram_asset = test_asset(
            ProvisioningTarget::Embeddings,
            BASELINE_MIN_FREE_DISK_BYTES * 3,
            BASELINE_MIN_FREE_DISK_BYTES * 2,
            DiskFootprint::Archive {
                staged_bytes: Some(BASELINE_MIN_FREE_DISK_BYTES * 3),
            },
            BASELINE_MIN_FREE_RAM_BYTES - 1,
            AssetHashStrategy::ArchiveSha256AndFileInventory {
                archive_sha256: "archive-sha256",
                files: &TEST_FILES,
            },
        );
        assert_eq!(
            required_free_ram_bytes(&lower_peak_ram_asset),
            BASELINE_MIN_FREE_RAM_BYTES
        );
    }

    #[test]
    fn one_byte_below_disk_threshold_returns_validation_error() {
        let probe = FixedResourceProbe::new(ResourceSnapshot {
            free_disk_bytes: BASELINE_MIN_FREE_DISK_BYTES - 1,
            free_ram_bytes: BASELINE_MIN_FREE_RAM_BYTES,
        });

        let err = ensure_resources_available(&probe, &TINY_LLAMA_ASSET, Path::new("C:/models"))
            .unwrap_err();
        assert!(
            matches!(err, AppError::Validation(message) if message.contains("free disk bytes"))
        );
    }

    #[test]
    fn one_byte_below_ram_threshold_returns_validation_error() {
        let probe = FixedResourceProbe::new(ResourceSnapshot {
            free_disk_bytes: BASELINE_MIN_FREE_DISK_BYTES,
            free_ram_bytes: BASELINE_MIN_FREE_RAM_BYTES - 1,
        });

        let err = ensure_resources_available(&probe, &TINY_LLAMA_ASSET, Path::new("C:/models"))
            .unwrap_err();
        assert!(matches!(err, AppError::Validation(message) if message.contains("free RAM bytes")));
    }

    #[test]
    fn exact_threshold_equality_passes() {
        let probe = FixedResourceProbe::new(ResourceSnapshot {
            free_disk_bytes: BASELINE_MIN_FREE_DISK_BYTES,
            free_ram_bytes: BASELINE_MIN_FREE_RAM_BYTES,
        });

        let resources =
            ensure_resources_available(&probe, &TINY_LLAMA_ASSET, Path::new("C:/models")).unwrap();
        assert_eq!(
            resources,
            ResourceSnapshot {
                free_disk_bytes: BASELINE_MIN_FREE_DISK_BYTES,
                free_ram_bytes: BASELINE_MIN_FREE_RAM_BYTES,
            }
        );
    }

    #[test]
    fn models_dir_uses_injected_vault_root() {
        let vault_root = Path::new("C:/SpellbookVault");
        assert_eq!(models_dir(vault_root), vault_root.join("models"));
    }
}

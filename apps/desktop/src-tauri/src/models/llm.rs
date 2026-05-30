use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub enum LlmStatus {
    NotProvisioned,
    Downloading,
    Ready,
    Loaded,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct LlmStatusResponse {
    pub status: LlmStatus,
    pub model_path: String,
    pub bytes_downloaded: Option<u64>,
    pub total_bytes: Option<u64>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct DownloadProgressEvent {
    pub bytes_downloaded: u64,
    pub total_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct TokenEvent {
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: ChatRole,
    pub content: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub enum ChatRole {
    User,
    Assistant,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct RagSpellContext {
    pub id: i64,
    pub name: String,
    pub school: Option<String>,
    pub level: i64,
    pub description_snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct LlmChatGrounding {
    pub search_terms: Vec<String>,
    pub grounded_spells: Vec<RagSpellContext>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct DoneEvent {
    pub full_response: String,
    pub cancelled: bool,
    pub search_terms: Vec<String>,
    pub grounded_spells: Vec<RagSpellContext>,
    pub timed_out: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    #[test]
    fn chat_role_serializes_to_lowercase_variant_names() {
        assert_eq!(
            serde_json::to_string(&ChatRole::User).unwrap(),
            "\"user\""
        );
        assert_eq!(
            serde_json::to_string(&ChatRole::Assistant).unwrap(),
            "\"assistant\""
        );
    }

    #[test]
    fn chat_message_uses_camel_case_keys_and_roundtrips() {
        let message = ChatMessage {
            role: ChatRole::User,
            content: "Tell me about fireball".to_string(),
        };

        let json = serde_json::to_string(&message).unwrap();
        let value: Value = serde_json::from_str(&json).unwrap();
        assert_eq!(value["role"], json!("user"));
        assert_eq!(value["content"], json!("Tell me about fireball"));
        let object = value.as_object().expect("object");
        assert!(object.contains_key("role"));
        assert!(object.contains_key("content"));
        assert_eq!(object.len(), 2);

        let roundtrip: ChatMessage = serde_json::from_str(&json).unwrap();
        assert!(matches!(roundtrip.role, ChatRole::User));
        assert_eq!(roundtrip.content, message.content);
    }
}

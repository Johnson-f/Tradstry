//! Encryption for secrets stored in the database: SnapTrade user secrets, OAuth
//! tokens, and PKCE verifiers. The format matches v1 (`base64(nonce‖ciphertext)`
//! under AES-256-GCM), so v1 secrets stay readable with the same key.

use aes_gcm::{Aes256Gcm, KeyInit, Nonce, aead::Aead};
use anyhow::{Context, Result, anyhow, ensure};
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};

const NONCE_LEN: usize = 12;

#[derive(Clone)]
pub struct SecretBox {
    cipher: Aes256Gcm,
}

impl std::fmt::Debug for SecretBox {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("SecretBox(..)")
    }
}

impl SecretBox {
    /// `key` is base64 of exactly 32 random bytes, as in `BROKERAGE_ENCRYPTION_KEY`.
    pub fn from_base64_key(key: &str) -> Result<Self> {
        let decoded = BASE64
            .decode(key.trim())
            .context("BROKERAGE_ENCRYPTION_KEY must be valid base64")?;
        ensure!(
            decoded.len() == 32,
            "BROKERAGE_ENCRYPTION_KEY must decode to exactly 32 bytes, got {}",
            decoded.len()
        );
        let cipher = Aes256Gcm::new_from_slice(&decoded).context("build the cipher")?;
        Ok(Self { cipher })
    }

    pub fn encrypt(&self, plaintext: &str) -> Result<String> {
        let mut nonce_bytes = [0u8; NONCE_LEN];
        getrandom::fill(&mut nonce_bytes)
            .map_err(|e| anyhow!("no randomness for the nonce: {e}"))?;
        let ciphertext = self
            .cipher
            .encrypt(&Nonce::from(nonce_bytes), plaintext.as_bytes())
            .map_err(|e| anyhow!("encryption failed: {e}"))?;
        let mut combined = Vec::with_capacity(NONCE_LEN + ciphertext.len());
        combined.extend_from_slice(&nonce_bytes);
        combined.extend_from_slice(&ciphertext);
        Ok(BASE64.encode(combined))
    }

    pub fn decrypt(&self, encoded: &str) -> Result<String> {
        let combined = BASE64
            .decode(encoded)
            .context("encrypted secret is not base64")?;
        ensure!(combined.len() > NONCE_LEN, "encrypted secret is too short");
        let (nonce_bytes, ciphertext) = combined.split_at(NONCE_LEN);
        let nonce = Nonce::try_from(nonce_bytes)
            .map_err(|_| anyhow!("encrypted secret has a bad nonce"))?;
        let plaintext = self
            .cipher
            .decrypt(&nonce, ciphertext)
            .map_err(|_| anyhow!("decryption failed: wrong key or tampered secret"))?;
        String::from_utf8(plaintext).context("decrypted secret is not UTF-8")
    }
}

/// A fixed key for tests. Never configure it outside a test process.
#[doc(hidden)]
pub fn test_secret_box() -> SecretBox {
    SecretBox::from_base64_key("AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=")
        .expect("valid test key")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_and_uses_a_fresh_nonce_each_time() {
        let secrets = test_secret_box();
        let first = secrets.encrypt("user-secret").unwrap();
        let second = secrets.encrypt("user-secret").unwrap();
        assert_ne!(first, second);
        assert_eq!(secrets.decrypt(&first).unwrap(), "user-secret");
        assert_eq!(secrets.decrypt(&second).unwrap(), "user-secret");
    }

    #[test]
    fn rejects_tampering_wrong_keys_and_garbage() {
        let secrets = test_secret_box();
        let sealed = secrets.encrypt("user-secret").unwrap();
        let mut bytes = BASE64.decode(&sealed).unwrap();
        *bytes.last_mut().unwrap() ^= 1;
        assert!(secrets.decrypt(&BASE64.encode(&bytes)).is_err());

        let other = SecretBox::from_base64_key(&BASE64.encode([7u8; 32])).unwrap();
        assert!(other.decrypt(&sealed).is_err());
        assert!(secrets.decrypt("not base64!").is_err());
        assert!(secrets.decrypt(&BASE64.encode([0u8; 12])).is_err());
    }

    #[test]
    fn keys_must_be_32_bytes_of_base64() {
        assert!(SecretBox::from_base64_key(&BASE64.encode([1u8; 16])).is_err());
        assert!(SecretBox::from_base64_key("%%%").is_err());
        assert!(SecretBox::from_base64_key(&BASE64.encode([1u8; 32])).is_ok());
    }
}

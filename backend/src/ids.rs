use anyhow::{Context, Result, ensure};
use uuid::{Uuid, Variant, Version};

/// Creates a time-ordered RFC 9562 UUIDv7.
pub fn new_uuid_v7() -> Uuid {
    Uuid::now_v7()
}

/// Validates an ID minted by an offline client for a new persistent record.
pub fn require_uuid_v7(value: &str) -> Result<Uuid> {
    let id = Uuid::parse_str(value).context("client-supplied id must be a UUID")?;
    ensure!(
        id.get_variant() == Variant::RFC4122 && id.get_version() == Some(Version::SortRand),
        "client-supplied id must be a UUIDv7"
    );
    Ok(id)
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;

    #[test]
    fn generated_ids_are_canonical_ordered_uuid_v7_values() {
        let ids: Vec<Uuid> = (0..10_000).map(|_| new_uuid_v7()).collect();

        assert!(ids.iter().all(|id| {
            id.get_variant() == Variant::RFC4122
                && id.get_version() == Some(Version::SortRand)
                && id.to_string().len() == 36
        }));
        assert_eq!(ids.iter().collect::<HashSet<_>>().len(), ids.len());
        assert!(ids.windows(2).all(|pair| pair[0] < pair[1]));
    }

    #[test]
    fn client_id_validation_requires_version_seven() {
        assert!(require_uuid_v7(&new_uuid_v7().to_string()).is_ok());
        assert!(require_uuid_v7("550e8400-e29b-41d4-a716-446655440000").is_err());
        assert!(require_uuid_v7("74738ff5-5367-5958-9aee-98fffdcd1876").is_err());
        assert!(require_uuid_v7("not-a-uuid").is_err());
    }
}

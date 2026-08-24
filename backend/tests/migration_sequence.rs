use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;

#[test]
fn migration_versions_do_not_have_gaps() {
    let migrations = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("migrations");
    let versions = fs::read_dir(migrations)
        .expect("read migration directory")
        .map(|entry| {
            let name = entry
                .expect("read migration entry")
                .file_name()
                .into_string()
                .expect("migration filename is UTF-8");
            name.split_once('_')
                .expect("migration filename starts with a numeric version")
                .0
                .parse::<u64>()
                .expect("migration version is numeric")
        })
        .collect::<BTreeSet<_>>();

    let first = *versions.first().expect("at least one migration");
    let last = *versions.last().expect("at least one migration");
    let missing = (first..=last)
        .filter(|version| !versions.contains(version))
        .collect::<Vec<_>>();

    assert!(
        missing.is_empty(),
        "migration versions must be contiguous; missing {missing:?}"
    );
}

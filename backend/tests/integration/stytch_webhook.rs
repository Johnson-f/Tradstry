use tradstry_backend::routes::stytch_webhook::deleted_user_id;

#[test]
fn extracts_the_stytch_user_id_from_a_delete_event() {
    for source in ["direct", "dashboard"] {
        let payload = serde_json::json!({
            "project_id": "project-test-1",
            "event_id": "event-1",
            "action": "DELETE",
            "object_type": "user",
            "source": source,
            "id": "user-test-abc",
            "timestamp": "2026-10-13T00:00:00Z",
        });
        assert_eq!(deleted_user_id(&payload), Some("user-test-abc"));
    }
}

#[test]
fn ignores_events_that_are_not_user_deletes() {
    for (action, object_type) in [("CREATE", "user"), ("UPDATE", "user"), ("DELETE", "member")] {
        let payload = serde_json::json!({
            "action": action,
            "object_type": object_type,
            "id": "user-test-abc",
        });
        assert_eq!(deleted_user_id(&payload), None, "{action} {object_type}");
    }
}

#[test]
fn ignores_a_delete_event_with_no_id() {
    let payload = serde_json::json!({ "action": "DELETE", "object_type": "user" });
    assert_eq!(deleted_user_id(&payload), None);
}

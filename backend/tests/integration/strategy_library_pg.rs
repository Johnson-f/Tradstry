use crate::pg_support::{reset_schema, seed_user_workspace, test_pool};
use sqlx::migrate::Migrator;
use std::path::PathBuf;
use tradstry_backend::service::db::schema::tables::{playbook_table, tags_table};

async fn second_workspace(pool: &sqlx::PgPool, user_id: &str) -> String {
    let id = tradstry_backend::ids::new_uuid_v7().to_string();
    sqlx::query("INSERT INTO workspaces (id,user_id,name) VALUES ($1,$2,'Second Workspace')")
        .bind(&id)
        .bind(user_id)
        .execute(pool)
        .await
        .unwrap();
    id
}

#[tokio::test]
async fn playbooks_are_universal_by_default_and_can_be_limited_to_selected_workspaces() {
    let pool = test_pool().await;
    let _guard = reset_schema(&pool).await;
    tradstry_backend::service::db::schema::pg::migrate(&pool)
        .await
        .unwrap();
    let (user_id, first_workspace) = seed_user_workspace(&pool).await;
    let second_workspace = second_workspace(&pool, &user_id).await;

    let playbook = playbook_table::create_playbook(
        &pool,
        &user_id,
        playbook_table::CreatePlaybookInput {
            workspace_id: first_workspace.clone(),
            name: "Breakout".into(),
            edge_name: "Momentum".into(),
            entry_rules: "Price above pivot".into(),
            exit_rules: "Exit at stop or target".into(),
            position_sizing_rules: "Risk one percent".into(),
            additional_rules: None,
        },
    )
    .await
    .unwrap();

    assert_eq!(playbook.availability, "all");
    assert!(
        playbook_table::list_playbooks(&pool, &user_id, &second_workspace)
            .await
            .unwrap()
            .iter()
            .any(|item| item.id == playbook.id)
    );

    playbook_table::set_playbook_applicability(
        &pool,
        &user_id,
        &playbook.id,
        "selected",
        std::slice::from_ref(&first_workspace),
    )
    .await
    .unwrap();

    assert!(
        playbook_table::list_playbooks(&pool, &user_id, &second_workspace)
            .await
            .unwrap()
            .iter()
            .all(|item| item.id != playbook.id)
    );
    let selected = playbook_table::find_playbook(&pool, &playbook.id, &user_id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(selected.workspace_ids, vec![first_workspace]);
}

#[tokio::test]
async fn tag_categories_are_universal_by_default_and_tags_inherit_applicability() {
    let pool = test_pool().await;
    let _guard = reset_schema(&pool).await;
    tradstry_backend::service::db::schema::pg::migrate(&pool)
        .await
        .unwrap();
    let (user_id, first_workspace) = seed_user_workspace(&pool).await;
    let second_workspace = second_workspace(&pool, &user_id).await;

    let category =
        tags_table::create_category(&pool, &user_id, &first_workspace, "Execution", None)
            .await
            .unwrap();
    let tag = tags_table::create_tag(
        &pool,
        &user_id,
        &first_workspace,
        &category.id,
        "Moved stop",
        None,
    )
    .await
    .unwrap();

    assert!(
        tags_table::list_categories(&pool, &user_id, &second_workspace)
            .await
            .unwrap()
            .iter()
            .any(|item| item.id == category.id)
    );
    assert!(
        tags_table::list_tags(&pool, &user_id, &second_workspace, None)
            .await
            .unwrap()
            .iter()
            .any(|item| item.id == tag.id)
    );

    tags_table::set_category_applicability(
        &pool,
        &user_id,
        &category.id,
        "selected",
        std::slice::from_ref(&first_workspace),
    )
    .await
    .unwrap();

    assert!(
        tags_table::list_categories(&pool, &user_id, &second_workspace)
            .await
            .unwrap()
            .iter()
            .all(|item| item.id != category.id)
    );
    assert!(
        tags_table::list_tags(&pool, &user_id, &second_workspace, None)
            .await
            .unwrap()
            .iter()
            .all(|item| item.id != tag.id)
    );
}

#[tokio::test]
async fn migration_deduplicates_workspace_clones_and_preserves_trade_links() {
    let pool = test_pool().await;
    let _guard = reset_schema(&pool).await;
    let migrations_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("schema/archive/sqlx");
    let all = Migrator::new(migrations_path.as_path()).await.unwrap();
    Migrator::with_migrations(
        all.iter()
            .filter(|migration| migration.version <= 47)
            .cloned()
            .collect(),
    )
    .run(&pool)
    .await
    .unwrap();

    sqlx::raw_sql(
        r#"
        INSERT INTO users (id,clerk_uuid) VALUES ('u','clerk-u');
        INSERT INTO workspaces (id,user_id,name) VALUES ('w1','u','Cash'),('w2','u','Margin');
        INSERT INTO playbooks (id,user_id,workspace_id,name,edge_name,entry_rules,exit_rules,position_sizing_rules)
        VALUES
          ('p1','u','w1','Breakout','Momentum','Entry','Exit','Risk'),
          ('p2','u','w2','Breakout','Momentum','Entry','Exit','Risk');
        INSERT INTO journal_entries
          (id,user_id,workspace_id,open_date,close_date,entry_price,exit_price,position_size,
           symbol,symbol_name,status,total_pl,net_roi,duration,trade_type,mistakes,entry_tactics,
           edges_spotted,playbook_id)
        VALUES ('j','u','w2',now(),now(),10,11,1,'AAPL','Apple','profit',10,10,60,'long','','','', 'p2');
        INSERT INTO tag_categories (id,user_id,workspace_id,name,role,sort_order,created_at,updated_at)
        VALUES ('c1','u','w1','Execution',NULL,0,now(),now()),('c2','u','w2','Execution',NULL,0,now(),now());
        INSERT INTO tags (id,user_id,workspace_id,category_id,name,created_at,updated_at)
        VALUES ('t1','u','w1','c1','Moved stop',now(),now()),('t2','u','w2','c2','Moved stop',now(),now());
        INSERT INTO trade_tags (journal_entry_id,tag_id) VALUES ('j','t2');
        "#,
    )
    .execute(&pool)
    .await
    .unwrap();

    all.run(&pool).await.unwrap();

    let playbook_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM playbooks WHERE user_id='u' AND deleted_at IS NULL",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let linked_playbook: String =
        sqlx::query_scalar("SELECT playbook_id FROM journal_entries WHERE id='j'")
            .fetch_one(&pool)
            .await
            .unwrap();
    let category_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM tag_categories WHERE user_id='u' AND deleted_at IS NULL",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let tag_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM tags WHERE user_id='u' AND deleted_at IS NULL")
            .fetch_one(&pool)
            .await
            .unwrap();
    let trade_tag_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM trade_tags WHERE journal_entry_id='j'")
            .fetch_one(&pool)
            .await
            .unwrap();

    assert_eq!(playbook_count, 1);
    assert_eq!(linked_playbook, "p1");
    assert_eq!(category_count, 1);
    assert_eq!(tag_count, 1);
    assert_eq!(trade_tag_count, 1);
}

DROP INDEX ux_notebook_folders_one_system_per_account;
CREATE UNIQUE INDEX ux_notebook_folders_one_system_per_account
    ON notebook_folders (workspace_id) WHERE is_system AND parent_folder_id IS NULL;
CREATE UNIQUE INDEX ux_notebook_folders_system_children
    ON notebook_folders (workspace_id, parent_folder_id, name)
    WHERE is_system AND parent_folder_id IS NOT NULL;

INSERT INTO notebook_folders(id,user_id,workspace_id,name,sort_order,is_system)
SELECT uuidv7()::text,w.user_id,w.id,'System',-1,true FROM workspaces w
WHERE NOT EXISTS (SELECT 1 FROM notebook_folders f WHERE f.workspace_id=w.id AND f.is_system AND f.parent_folder_id IS NULL);

INSERT INTO notebook_folders(id,user_id,workspace_id,parent_folder_id,name,sort_order,is_system)
SELECT uuidv7()::text,f.user_id,f.workspace_id,f.id,'Recent Trades',-1,true
FROM notebook_folders f WHERE f.is_system AND f.parent_folder_id IS NULL;

-- Advance the sync stamp so existing desktop copies accept the new folder.
UPDATE notebook_notes n SET folder_id=f.id,
    hlc=lpad((greatest(floor(extract(epoch FROM clock_timestamp())*1000)::bigint,
        CASE WHEN n.hlc ~ '^[0-9]{15}:[0-9]{5}:' THEN split_part(n.hlc,':',1)::bigint ELSE 0 END)+1)::text,15,'0') || ':00000:server'
FROM notebook_folders f
WHERE n.purpose='trade_context' AND n.user_id=f.user_id AND n.workspace_id=f.workspace_id
    AND f.is_system AND f.name='Recent Trades' AND f.parent_folder_id IS NOT NULL;

INSERT INTO notebook_note_trades(note_id,trade_id)
SELECT c.companion_note_id,c.entry_id FROM journal_trade_context c
JOIN notebook_notes n ON n.id=c.companion_note_id AND n.user_id=c.user_id AND n.workspace_id=c.workspace_id
ON CONFLICT (note_id,trade_id) DO NOTHING;

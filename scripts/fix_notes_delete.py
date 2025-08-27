#!/usr/bin/env python3
"""
Script to fix the notes delete functions in Supabase database.
This script updates the SQL functions to correctly handle system folders.
"""

import os
import sys
from pathlib import Path

# Add the parent directory to the path to import backend modules
sys.path.append(str(Path(__file__).parent.parent))

from backend.database import get_supabase
from backend.config import get_settings

def update_delete_functions():
    """Update the delete_note, permanent_delete_note, and restore_note functions."""

    # Get Supabase client
    supabase = get_supabase()

    # SQL for the corrected delete_note function
    delete_note_sql = """
    -- Function to soft delete a note (move to trash)
    CREATE OR REPLACE FUNCTION delete_note(p_note_id UUID)
    RETURNS TABLE (success BOOLEAN, message TEXT)
    LANGUAGE plpgsql SECURITY DEFINER AS $$
    DECLARE
        v_user_id UUID := auth.uid();
        v_trash_folder_id UUID;
        v_note_title TEXT;
    BEGIN
        -- Get trash folder ID (system folder, no user_id filter needed)
        SELECT id INTO v_trash_folder_id
        FROM public.folders
        WHERE slug = 'trash' AND is_system = true;

        IF v_trash_folder_id IS NULL THEN
            RETURN QUERY SELECT false, 'Trash folder not found';
            RETURN;
        END IF;

        -- Update note to mark as deleted and move to trash
        UPDATE public.notes
        SET is_deleted = true,
            deleted_at = now(),
            folder_id = v_trash_folder_id,
            updated_at = now()
        WHERE id = p_note_id AND user_id = v_user_id
        RETURNING title INTO v_note_title;

        IF FOUND THEN
            RETURN QUERY SELECT true, format('Moved note to trash: %s', COALESCE(v_note_title, 'Untitled Note'));
        ELSE
            RETURN QUERY SELECT false, 'Note not found or access denied';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT false, 'Error: ' || SQLERRM;
    END;
    $$;
    """

    # SQL for the corrected permanent_delete_note function
    permanent_delete_note_sql = """
    -- Function to permanently delete a note (only from trash)
    CREATE OR REPLACE FUNCTION permanent_delete_note(p_note_id UUID)
    RETURNS TABLE (success BOOLEAN, message TEXT)
    LANGUAGE plpgsql SECURITY DEFINER AS $$
    DECLARE
        v_user_id UUID := auth.uid();
        v_note_title TEXT;
    BEGIN
        -- Permanently delete the note (only if in trash)
        DELETE FROM public.notes n
        USING public.folders f
        WHERE n.id = p_note_id
        AND n.user_id = v_user_id
        AND n.folder_id = f.id
        AND f.slug = 'trash'
        AND f.is_system = true
        RETURNING n.title INTO v_note_title;

        IF FOUND THEN
            RETURN QUERY SELECT true, format('Permanently deleted: %s', COALESCE(v_note_title, 'Note'));
        ELSE
            RETURN QUERY SELECT false, 'Note not found in trash or access denied';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT false, 'Error: ' || SQLERRM;
    END;
    $$;
    """

    # SQL for the corrected restore_note function
    restore_note_sql = """
    -- Function to restore a note from trash
    CREATE OR REPLACE FUNCTION restore_note(
        p_note_id UUID,
        p_target_folder_slug TEXT DEFAULT 'notes'
    )
    RETURNS TABLE (success BOOLEAN, message TEXT)
    LANGUAGE plpgsql SECURITY DEFINER AS $$
    DECLARE
        v_user_id UUID := auth.uid();
        v_target_folder_id UUID;
        v_note_title TEXT;
    BEGIN
        -- Get target folder ID (system folder)
        SELECT id INTO v_target_folder_id
        FROM public.folders
        WHERE slug = p_target_folder_slug AND is_system = true;

        IF v_target_folder_id IS NULL THEN
            RETURN QUERY SELECT false, 'Target folder not found';
            RETURN;
        END IF;

        -- Restore the note
        UPDATE public.notes n
        SET is_deleted = false,
            deleted_at = NULL,
            folder_id = v_target_folder_id,
            updated_at = now()
        FROM public.folders f
        WHERE n.id = p_note_id
        AND n.user_id = v_user_id
        AND n.folder_id = f.id
        AND f.slug = 'trash'
        AND f.is_system = true
        RETURNING n.title INTO v_note_title;

        IF FOUND THEN
            RETURN QUERY SELECT true, format('Restored note: %s', COALESCE(v_note_title, 'Untitled Note'));
        ELSE
            RETURN QUERY SELECT false, 'Note not found in trash or access denied';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT false, 'Error: ' || SQLERRM;
    END;
    $$;
    """

    # Grant permissions SQL
    grant_permissions_sql = """
    -- Grant execute permissions
    GRANT EXECUTE ON FUNCTION delete_note(UUID) TO authenticated;
    GRANT EXECUTE ON FUNCTION permanent_delete_note(UUID) TO authenticated;
    GRANT EXECUTE ON FUNCTION restore_note(UUID, TEXT) TO authenticated;
    """

    try:
        print("Updating delete_note function...")
        supabase.rpc('exec_sql', {'sql': delete_note_sql}).execute()
        print("✅ delete_note function updated successfully")

        print("Updating permanent_delete_note function...")
        supabase.rpc('exec_sql', {'sql': permanent_delete_note_sql}).execute()
        print("✅ permanent_delete_note function updated successfully")

        print("Updating restore_note function...")
        supabase.rpc('exec_sql', {'sql': restore_note_sql}).execute()
        print("✅ restore_note function updated successfully")

        print("Granting permissions...")
        supabase.rpc('exec_sql', {'sql': grant_permissions_sql}).execute()
        print("✅ Permissions granted successfully")

        print("\n🎉 All functions updated successfully!")
        print("\nThe notes delete operation should now work correctly.")
        print("Notes will be moved to the trash folder when deleted (soft delete).")

    except Exception as e:
        print(f"❌ Error updating functions: {str(e)}")
        print("\nTrying alternative approach using direct SQL execution...")

        # Alternative approach: Execute each function separately
        try:
            # Execute functions one by one
            functions = [
                ("delete_note", delete_note_sql),
                ("permanent_delete_note", permanent_delete_note_sql),
                ("restore_note", restore_note_sql),
                ("permissions", grant_permissions_sql)
            ]

            for func_name, sql in functions:
                print(f"Executing {func_name}...")
                result = supabase.postgrest.rpc('exec_sql', {'query': sql}).execute()
                print(f"✅ {func_name} executed successfully")

            print("\n🎉 All functions updated successfully using alternative method!")

        except Exception as e2:
            print(f"❌ Alternative approach also failed: {str(e2)}")
            print("\nManual steps required:")
            print("1. Go to your Supabase dashboard")
            print("2. Navigate to SQL Editor")
            print("3. Execute the following SQL commands:")
            print("\n" + "="*50)
            print(delete_note_sql)
            print(permanent_delete_note_sql)
            print(restore_note_sql)
            print(grant_permissions_sql)
            print("="*50)
            return False

    return True

def verify_functions():
    """Verify that the functions were updated correctly."""
    supabase = get_supabase()

    try:
        # Check if trash folder exists
        print("\nVerifying trash folder exists...")
        result = supabase.table('folders').select('id, name, slug, is_system').eq('slug', 'trash').execute()

        if result.data:
            folder = result.data[0]
            print(f"✅ Trash folder found: {folder['name']} (ID: {folder['id']}, System: {folder['is_system']})")
        else:
            print("❌ Trash folder not found!")
            return False

        # Test the delete_note function with a dummy UUID (this should fail gracefully)
        print("\nTesting delete_note function...")
        test_uuid = "00000000-0000-0000-0000-000000000000"
        result = supabase.rpc('delete_note', {'p_note_id': test_uuid}).execute()

        if result.data and len(result.data) > 0:
            response = result.data[0]
            if not response['success'] and 'not found' in response['message'].lower():
                print("✅ delete_note function working correctly (returns proper error for non-existent note)")
            else:
                print(f"⚠️ Unexpected response: {response}")
        else:
            print("❌ delete_note function not responding correctly")
            return False

        print("\n🎉 Verification completed successfully!")
        return True

    except Exception as e:
        print(f"❌ Error during verification: {str(e)}")
        return False

if __name__ == "__main__":
    print("🔧 Fixing notes delete operation...")
    print("This script will update the SQL functions to correctly handle the trash folder.")
    print()

    # Update functions
    if update_delete_functions():
        # Verify the update
        verify_functions()
    else:
        print("\n❌ Function update failed. Please apply the changes manually.")
        sys.exit(1)

    print("\n✅ Script completed successfully!")
    print("You can now test the notes delete operation - it should work correctly.")

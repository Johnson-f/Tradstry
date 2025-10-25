import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ noteId: string }> }
) {
  try {
    const { noteId } = await params;
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all images for the note
    const { data: images, error: fetchError } = await supabase
      .from('notebook_images')
      .select('*')
      .eq('note_id', noteId)
      .eq('user_id', user.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('Database fetch error:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch images' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      images: images || [],
      total: images?.length || 0,
      note_id: noteId
    });
  } catch (error) {
    console.error('Get images by note error:', error);
    return NextResponse.json({ error: 'Failed to get images for note' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ noteId: string }> }
) {
  try {
    const { noteId } = await params;
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all images for the note
    const { data: images, error: fetchError } = await supabase
      .from('notebook_images')
      .select('id, file_path')
      .eq('note_id', noteId)
      .eq('user_id', user.id);

    if (fetchError) {
      console.error('Database fetch error:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch images for deletion' }, { status: 500 });
    }

    if (!images || images.length === 0) {
      return NextResponse.json({ success: true, message: 'No images to delete' });
    }

    // Delete from storage
    const filePaths = images.map(img => img.file_path);
    const { error: storageError } = await supabase.storage
      .from('notebook-images')
      .remove(filePaths);

    if (storageError) {
      console.error('Storage deletion error:', storageError);
      // Continue with database deletion even if storage fails
    }

    // Delete from database
    const { error: dbError } = await supabase
      .from('notebook_images')
      .delete()
      .eq('note_id', noteId)
      .eq('user_id', user.id);

    if (dbError) {
      console.error('Database deletion error:', dbError);
      return NextResponse.json({ error: 'Failed to delete image metadata' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `Deleted ${images.length} images`,
      deleted_count: images.length
    });
  } catch (error) {
    console.error('Delete images by note error:', error);
    return NextResponse.json({ error: 'Failed to delete images for note' }, { status: 500 });
  }
}

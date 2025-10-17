import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const noteId = formData.get('note_id') as string;
    const altText = formData.get('alt_text') as string;
    const caption = formData.get('caption') as string;
    
    if (!file || !noteId) {
      return NextResponse.json({ error: 'Missing file or note_id' }, { status: 400 });
    }

    // Generate unique file path
    const fileExt = file.name.split('.').pop();
    const imageId = crypto.randomUUID();
    const filePath = `${user.id}/notebooks/${noteId}/${imageId}.${fileExt}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('notebook-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json({ error: 'Failed to upload file to storage' }, { status: 500 });
    }

    // Create metadata record in database
    const { data: imageData, error: dbError } = await supabase
      .from('notebook_images')
      .insert({
        id: imageId,
        note_id: noteId,
        user_id: user.id,
        file_path: filePath,
        filename: file.name,
        mime_type: file.type,
        file_size: file.size,
        alt_text: altText || null,
        caption: caption || null
      })
      .select()
      .single();

    if (dbError) {
      // Cleanup: delete uploaded file if DB insert fails
      await supabase.storage.from('notebook-images').remove([filePath]);
      console.error('Database insert error:', dbError);
      return NextResponse.json({ error: 'Failed to save image metadata' }, { status: 500 });
    }

    // Generate signed URL
    const { data: urlData, error: urlError } = await supabase.storage
      .from('notebook-images')
      .createSignedUrl(filePath, 3600);

    if (urlError) {
      console.error('URL generation error:', urlError);
      return NextResponse.json({ error: 'Failed to generate image URL' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      id: imageId, 
      url: urlData?.signedUrl || '' 
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

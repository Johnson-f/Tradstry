import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Increase the max duration for this route if on Vercel
export const maxDuration = 60;

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

    // Check file size (limit to 5MB to prevent EPIPE errors)
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ 
        error: 'File too large. Maximum size is 5MB' 
      }, { status: 400 });
    }

    // Generate unique file path
    const fileExt = file.name.split('.').pop();
    const imageId = crypto.randomUUID();
    const filePath = `${user.id}/notebooks/${noteId}/${imageId}.${fileExt}`;

    // Convert File to ArrayBuffer for more reliable upload
    const fileArrayBuffer = await file.arrayBuffer();
    const fileBuffer = new Uint8Array(fileArrayBuffer);

    // Upload to Supabase Storage with proper content type and options
    const { error: uploadError } = await supabase.storage
      .from('notebook-images')
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
        duplex: 'half' // This helps prevent EPIPE errors
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      
      // Provide more specific error messages
      if (uploadError.message?.includes('fetch failed') || uploadError.message?.includes('EPIPE')) {
        return NextResponse.json({ 
          error: 'Network error during upload. Please try again with a smaller image or check your connection.' 
        }, { status: 500 });
      }
      
      return NextResponse.json({ 
        error: `Failed to upload file: ${uploadError.message}` 
      }, { status: 500 });
    }

    // Create metadata record in database
    const { error: dbError } = await supabase
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
      return NextResponse.json({ 
        error: 'Failed to save image metadata' 
      }, { status: 500 });
    }

    // Generate signed URL with longer expiry
    const { error: urlError } = await supabase.storage
      .from('notebook-images')
      .createSignedUrl(filePath, 3600 * 24); // 24 hours

    if (urlError) {
      console.error('URL generation error:', urlError);
      return NextResponse.json({ 
        error: 'Failed to generate image URL' 
      }, { status: 500 });
    }

    // Return API proxy URL instead of direct Supabase URL to avoid CORS issues
    const proxyUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/notebook/images/${imageId}`;

    return NextResponse.json({ 
      success: true, 
      id: imageId, 
      url: proxyUrl
    });
  } catch (error) {
    console.error('Upload error:', error);
    
    // Check for specific error types
    if (error instanceof Error) {
      if (error.message.includes('fetch failed') || error.message.includes('EPIPE')) {
        return NextResponse.json({ 
          error: 'Network error during upload. Please try a smaller image or check your connection.' 
        }, { status: 500 });
      }
    }
    
    return NextResponse.json({ 
      error: 'Upload failed. Please try again.' 
    }, { status: 500 });
  }
}
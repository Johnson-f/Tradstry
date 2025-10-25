import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  try {
    const { imageId } = await params;
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get image metadata
    const { data: image, error: fetchError } = await supabase
      .from('notebook_images')
      .select('file_path, mime_type, file_size, filename')
      .eq('id', imageId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    // Generate signed URL
    const { data: urlData, error: urlError } = await supabase.storage
      .from('notebook-images')
      .createSignedUrl(image.file_path, 3600);

    if (urlError) {
      console.error('URL generation error:', urlError);
      return NextResponse.json({ error: 'Failed to generate image URL' }, { status: 500 });
    }

    // Fetch the image data from Supabase Storage
    const imageResponse = await fetch(urlData.signedUrl);
    
    if (!imageResponse.ok) {
      console.error('Failed to fetch image from storage:', imageResponse.status);
      return NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 });
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    
    // Return the image with proper headers
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': image.mime_type || 'image/jpeg',
        'Content-Length': image.file_size?.toString() || '',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        'ETag': `"${imageId}"`,
        'Last-Modified': new Date().toUTCString(),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('Get image error:', error);
    return NextResponse.json({ error: 'Failed to get image' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  try {
    const { imageId } = await params;
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get image metadata
    const { data: image, error: fetchError } = await supabase
      .from('notebook_images')
      .select('file_path')
      .eq('id', imageId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('notebook-images')
      .remove([image.file_path]);

    if (storageError) {
      console.error('Storage deletion error:', storageError);
      return NextResponse.json({ error: 'Failed to delete image from storage' }, { status: 500 });
    }

    // Delete from database
    const { error: dbError } = await supabase
      .from('notebook_images')
      .delete()
      .eq('id', imageId)
      .eq('user_id', user.id);

    if (dbError) {
      console.error('Database deletion error:', dbError);
      return NextResponse.json({ error: 'Failed to delete image metadata' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete image error:', error);
    return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 });
  }
}

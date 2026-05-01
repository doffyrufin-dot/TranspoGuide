import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

const isSafeFilename = (value: string) =>
  /^vehicle-[A-Za-z0-9._-]+\.(png|jpe?g|webp|gif|svg)$/i.test(value);

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ filename: string }> }
) {
  try {
    const params = await context.params;
    const raw = String(params.filename || '').trim();
    const filename = decodeURIComponent(raw);
    if (!isSafeFilename(filename)) {
      return NextResponse.json({ error: 'invalid_file' }, { status: 400 });
    }

    const ext = path.extname(filename).toLowerCase();
    const mimeType = MIME_BY_EXT[ext] || 'application/octet-stream';
    const filePath = path.join(
      process.cwd(),
      'public',
      'uploads',
      'vehicles',
      filename
    );
    const bytes = await readFile(filePath);

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'file_not_found' }, { status: 404 });
  }
}


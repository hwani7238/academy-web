import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  const filename = searchParams.get("filename") || "video.mp4";

  if (!url) {
    return NextResponse.json({ error: "Missing URL" }, { status: 400 });
  }

  // Security: only allow downloads from firebase storage domain
  const allowedHost = "firebasestorage.googleapis.com";
  try {
    const parsedUrl = new URL(url);
    const isFirebaseStorage =
      parsedUrl.hostname === allowedHost ||
      parsedUrl.hostname.endsWith(".firebasestorage.app");

    if (!isFirebaseStorage) {
      return NextResponse.json({ error: "Forbidden domain" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.status}`);
    }

    // Read the stream
    const data = response.body;
    if (!data) {
      throw new Error("No data in response");
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";

    // Set headers to force download (Content-Disposition: attachment)
    const headers = new Headers();
    const encodedFilename = encodeURIComponent(filename);
    headers.set("Content-Disposition", `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);
    headers.set("Content-Type", contentType);

    // Return the response as a file stream
    return new Response(data, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Error in download proxy:", error);
    return NextResponse.json({ error: "Failed to download file" }, { status: 500 });
  }
}

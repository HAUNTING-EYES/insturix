export async function fetchSignedUrl(gcsUrl: string): Promise<string | null> {
  try {
    const res = await fetch("/api/services/musitron/gcs/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: gcsUrl.split("/").pop(),
        contentType: "audio/mpeg",
        gcsUrl,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.url || null;
  } catch {
    return null;
  }
}

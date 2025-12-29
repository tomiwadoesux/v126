import { NextResponse } from "next/server";
import axios from "axios";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");

  if (!query) {
    return NextResponse.json(
      { error: "Missing query parameter" },
      { status: 400 }
    );
  }

  const token = process.env.GENIUS_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "Server missing GENIUS_ACCESS_TOKEN" },
      { status: 500 }
    );
  }

  try {
    // 1. Search for the song
    const searchRes = await axios.get(`https://api.genius.com/search`, {
      params: { q: query },
      headers: { Authorization: `Bearer ${token}` },
    });

    const hits = searchRes.data.response.hits;
    if (!hits || hits.length === 0) {
      return NextResponse.json({ error: "No results found" }, { status: 404 });
    }

    // Assume the first hit is the correct one (usually is for specific song queries)
    const bestMatch = hits[0].result;
    const songId = bestMatch.id;

    // 2. Get Song Details (for description/trivia)
    // text_format=plain ensures we get plain text for the description (easier to display)
    const songRes = await axios.get(`https://api.genius.com/songs/${songId}`, {
      params: { text_format: "plain" },
      headers: { Authorization: `Bearer ${token}` },
    });

    const songData = songRes.data.response.song;

    return NextResponse.json({
      id: songData.id,
      title: songData.title,
      artist: songData.primary_artist.name,
      artworkUrl: songData.song_art_image_url, // High res artwork
      description: songData.description?.plain || "", // The "Trivia" / Story
      url: songData.url,
      releaseDate: songData.release_date_for_display,
    });
  } catch (error) {
    console.error("Genius API Error:", error.response?.data || error.message);
    return NextResponse.json(
      { error: "Failed to fetch Genius data" },
      { status: 500 }
    );
  }
}

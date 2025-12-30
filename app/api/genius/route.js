import { NextResponse } from "next/server";
import axios from "axios";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");

  console.log("Genius API called with query:", query);

  if (!query) {
    return NextResponse.json(
      { error: "Missing query parameter" },
      { status: 400 }
    );
  }

  const token = process.env.GENIUS_ACCESS_TOKEN;
  if (!token) {
    console.error("Missing GENIUS_ACCESS_TOKEN!");
    return NextResponse.json(
      { error: "Server missing GENIUS_ACCESS_TOKEN" },
      { status: 500 }
    );
  }

  console.log("Has Genius token:", !!token, "Token length:", token?.length);

  try {
    // 1. Search for the song
    console.log("Searching Genius for:", query);
    const searchRes = await axios.get(`https://api.genius.com/search`, {
      params: { q: query },
      headers: { Authorization: `Bearer ${token}` },
    });

    const hits = searchRes.data.response.hits;
    console.log("Genius search results:", hits?.length || 0, "hits");

    if (!hits || hits.length === 0) {
      console.log("No Genius results found");
      return NextResponse.json({ error: "No results found" }, { status: 404 });
    }

    // Assume the first hit is the correct one (usually is for specific song queries)
    const bestMatch = hits[0].result;
    const songId = bestMatch.id;
    console.log(
      "Best match:",
      bestMatch.title,
      "by",
      bestMatch.primary_artist?.name,
      "ID:",
      songId
    );

    // 2. Get Song Details (for description/trivia)
    // text_format=plain ensures we get plain text for the description (easier to display)
    const songRes = await axios.get(`https://api.genius.com/songs/${songId}`, {
      params: { text_format: "plain" },
      headers: { Authorization: `Bearer ${token}` },
    });

    const songData = songRes.data.response.song;

    console.log("Genius song data:", {
      title: songData.title,
      artist: songData.primary_artist?.name,
      artworkUrl: songData.song_art_image_url,
      hasDescription: !!songData.description?.plain,
    });

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
    console.error("Genius API Error:", {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
    return NextResponse.json(
      { error: "Failed to fetch Genius data" },
      { status: 500 }
    );
  }
}

"use client";

import { useState, useRef, useEffect } from "react";
import {
  Mic,
  Loader2,
  Music,
  Sparkles,
  ExternalLink,
  Info,
} from "lucide-react";
import axios from "axios";
import gsap from "gsap";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import Background from "./components/Background";
import Ayotomcs from "./components/ayotomcs";

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// --- COMPONENT: REAL-TIME AUDIO VISUALIZER ---
const Visualizer = ({ stream }) => {
  const containerRef = useRef(null);
  const analyserRef = useRef(null);
  const audioContextRef = useRef(null);
  const sourceRef = useRef(null);
  const rafIdRef = useRef(null);

  useEffect(() => {
    if (!stream || !containerRef.current) return;

    // 1. Setup Audio Context
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    audioContextRef.current = ctx;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    analyserRef.current = analyser;

    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    sourceRef.current = source;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // 2. Animate Loop
    const update = () => {
      if (!containerRef.current) return;

      analyser.getByteFrequencyData(dataArray);

      const indices = [2, 6, 12, 18, 24];
      const bars = containerRef.current.querySelectorAll(".bar");

      bars.forEach((bar, i) => {
        const value = dataArray[indices[i]] || 0;
        let heightPercent = (value / 255) * 100;
        heightPercent = Math.max(15, heightPercent);

        gsap.to(bar, {
          height: `${heightPercent}%`,
          duration: 0.1,
          ease: "power2.out",
        });
      });

      rafIdRef.current = requestAnimationFrame(update);
    };

    update();

    return () => {
      cancelAnimationFrame(rafIdRef.current);
      if (sourceRef.current) sourceRef.current.disconnect();
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== "closed"
      ) {
        audioContextRef.current.close();
      }
    };
  }, [stream]);

  // Fallback animation
  useEffect(() => {
    if (!stream) {
      const ctx = gsap.context(() => {
        gsap.to(".bar", {
          height: () => Math.random() * 50 + 20 + "%",
          duration: 0.2,
          ease: "power1.inOut",
          stagger: { each: 0.05, repeat: -1, yoyo: true, from: "random" },
        });
      }, containerRef);
      return () => ctx.revert();
    }
  }, [stream]);

  return (
    <div
      ref={containerRef}
      className="flex items-center justify-center gap-2 h-32 w-full max-w-[240px]"
    >
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="bar w-4 bg-[#4447a9] rounded-sm h-10 shadow-[0_0_15px_rgba(68,71,169,0.6)]"
        />
      ))}
    </div>
  );
};

export default function Home() {
  const [status, setStatus] = useState("idle");
  const [songData, setSongData] = useState(null);
  const [geniusData, setGeniusData] = useState(null);
  const [mood, setMood] = useState("default");

  const [lyrics, setLyrics] = useState([]);
  const [noLyrics, setNoLyrics] = useState(false);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);

  const [errorMessage, setErrorMessage] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);

  const songStartTimeRef = useRef(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [recordingStream, setRecordingStream] = useState(null);
  const mimeTypeRef = useRef("audio/webm");
  const audioLevelCheckRef = useRef(null);

  // REFS FOR KINETIC ANIMATION
  const tapeRef = useRef(null);
  const lineRefs = useRef([]);

  // --- THE ENGINE: AUTO SCROLLER ---
  useEffect(() => {
    let interval;
    if (status === "playing" && !noLyrics) {
      interval = setInterval(() => {
        const now = Date.now();
        const currentSongTimeSeconds = (now - songStartTimeRef.current) / 1000;

        const activeIndex = lyrics.findIndex((line, i) => {
          const nextLine = lyrics[i + 1];
          return (
            line.time <= currentSongTimeSeconds &&
            (!nextLine || nextLine.time > currentSongTimeSeconds)
          );
        });

        if (activeIndex !== -1 && activeIndex !== currentLineIndex) {
          setCurrentLineIndex(activeIndex);
        }
      }, 100);
    }
    return () => clearInterval(interval);
  }, [status, lyrics, currentLineIndex, noLyrics]);

  // --- KINETIC ANIMATION (GSAP TRANSFORM) ---
  useEffect(() => {
    if (status === "playing" && !noLyrics && tapeRef.current) {
      const activeEl = lineRefs.current[currentLineIndex];

      if (activeEl) {
        // Calculate center offset
        // We want the active element's center to align with the container's center (0 since we start at top-1/2)
        // But 'offsetTop' is relative to the top of the Tape.
        const offset = activeEl.offsetTop + activeEl.clientHeight / 2;

        // Move Tape UP by the offset amount to bring that element to Y=0 (relative to container center)
        gsap.to(tapeRef.current, {
          y: -offset,
          duration: 0.6,
          ease: "back.out(1)",
        });
      }
    }
  }, [currentLineIndex, status, noLyrics]);

  // 1. Start Recording
  const startRecording = async () => {
    try {
      setNoLyrics(false);
      setErrorMessage("");
      setAudioLevel(0);

      // High quality recording for music
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
        },
      });

      setRecordingStream(stream);

      // Setup audio level monitoring
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      let maxLevel = 0;
      let lowLevelCount = 0;
      const checkInterval = 200; // Check every 200ms

      audioLevelCheckRef.current = setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / bufferLength;
        const normalizedLevel = (average / 255) * 100;

        setAudioLevel(normalizedLevel);
        maxLevel = Math.max(maxLevel, normalizedLevel);

        // Count how many times the level is too low
        if (normalizedLevel < 10) {
          lowLevelCount++;
        }
      }, checkInterval);

      let options = { audioBitsPerSecond: 128000 };
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        options.mimeType = "audio/webm;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        options.mimeType = "audio/mp4";
      }

      mediaRecorderRef.current = new MediaRecorder(stream, options);
      mimeTypeRef.current = mediaRecorderRef.current.mimeType;
      console.log("Recording Mic Type:", mimeTypeRef.current);

      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        // Clear audio level monitoring
        if (audioLevelCheckRef.current) {
          clearInterval(audioLevelCheckRef.current);
        }

        // Check if audio was too quiet overall
        if (maxLevel < 15) {
          setStatus("idle");
          setErrorMessage(
            "⚠️ Audio signal too weak. Please bring the speaker much closer to your microphone and try again."
          );
          if (recordingStream) {
            recordingStream.getTracks().forEach((track) => track.stop());
            setRecordingStream(null);
          }
          return;
        }

        handleAudioStop();
      };

      mediaRecorderRef.current.start();
      setStatus("recording");

      setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }, 6000);
    } catch (err) {
      console.error("Mic access denied", err);
      if (err.name === "NotAllowedError") {
        setErrorMessage(
          "🎤 Microphone access denied. Please allow microphone permissions in your browser settings."
        );
      } else if (err.name === "NotFoundError") {
        setErrorMessage(
          "🎤 No microphone found. Please connect a microphone and try again."
        );
      } else {
        setErrorMessage(
          "❌ Could not access microphone. Please check your device settings."
        );
      }
      setStatus("idle");
    }
  };

  // 2. Handle Audio & Identify
  const handleAudioStop = async () => {
    setStatus("analyzing");

    if (recordingStream) {
      recordingStream.getTracks().forEach((track) => track.stop());
      setRecordingStream(null);
    }

    setSongData(null);
    setGeniusData(null);
    setMood("default");
    setNoLyrics(false);
    setCurrentLineIndex(0);
    // Reset tape position
    if (tapeRef.current) gsap.set(tapeRef.current, { y: 0 });

    const audioBlob = new Blob(audioChunksRef.current, {
      type: mimeTypeRef.current,
    });
    const formData = new FormData();
    formData.append("file", audioBlob);

    try {
      const res = await axios.post("/api/identify", formData);
      const data = res.data;

      if (data.status.code === 0 && data.metadata?.music?.[0]) {
        const music = data.metadata.music[0];
        setSongData(music);

        let detectedMood = "soft";
        if (music.genres) {
          const genreNames = music.genres
            .map((g) => g.name.toLowerCase())
            .join(" ");
          if (
            genreNames.match(/metal|rock|punk|grunge|industrial|rap|hip-hop/)
          ) {
            detectedMood = "aggressive";
          }
        }
        setMood(detectedMood);

        const LATENCY_COMPENSATION = 1500;
        const offsetMs = music.play_offset_ms;
        songStartTimeRef.current =
          Date.now() - (offsetMs + LATENCY_COMPENSATION);

        await Promise.all([
          fetchLyrics(music.title, music.artists[0].name),
          fetchGeniusData(music.title, music.artists[0].name),
        ]);
      } else {
        // Handle different error codes from ACRCloud
        let errorMsg = "";

        if (data.status.code === 1001) {
          errorMsg =
            "🔇 No music detected. Please bring the speaker closer to your microphone and ensure the music is playing clearly.";
        } else if (data.status.code === 2004) {
          errorMsg =
            "📡 Can't reach music database. Please check your internet connection and try again.";
        } else if (data.status.code === 3001) {
          errorMsg =
            "⏱️ Request timeout. The music sample may be too short or unclear. Please try again.";
        } else if (data.status.code === 3000) {
          errorMsg = "❌ Invalid audio format. Please try recording again.";
        } else {
          errorMsg =
            "🎵 Could not identify this song. Try:\n• Bringing the speaker closer to your mic\n• Reducing background noise\n• Playing a different part of the song";
        }

        console.warn("Match Failed", data);
        setErrorMessage(errorMsg);
        setStatus("idle");
      }
    } catch (err) {
      console.error("Identification error:", err);

      // Network error handling
      if (err.code === "ERR_NETWORK" || err.message.includes("Network")) {
        setErrorMessage(
          "📡 Network error. Please check your internet connection and try again."
        );
      } else if (err.response?.status === 413) {
        setErrorMessage(
          "📦 Audio file too large. This shouldn't happen - please refresh and try again."
        );
      } else if (err.response?.status >= 500) {
        setErrorMessage(
          "🔧 Server error. The music recognition service may be temporarily down. Please try again in a moment."
        );
      } else {
        setErrorMessage(
          "❌ Something went wrong during identification. Please try again."
        );
      }

      setStatus("idle");
    }
  };

  // 2b. Fetch Genius Data
  const fetchGeniusData = async (track, artist) => {
    try {
      console.log("Fetching Genius data for:", track, artist);
      const res = await axios.get("/api/genius", {
        params: { query: `${track} ${artist}` },
      });
      console.log("Genius data received:", res.data);
      if (res.data) {
        console.log("Artwork URL:", res.data.artworkUrl);
        setGeniusData(res.data);
      }
    } catch (err) {
      console.warn("Could not fetch Genius data:", err.message);
    }
  };

  // 3. Fetch Lyrics
  const fetchLyrics = async (track, artist) => {
    const cacheKey = `lyric_cache_${artist}_${track}`
      .replace(/\s/g, "")
      .toLowerCase();
    const cachedLyrics = localStorage.getItem(cacheKey);

    if (cachedLyrics) {
      setLyrics(JSON.parse(cachedLyrics));
      setNoLyrics(false);
      setStatus("playing");
      return;
    }

    try {
      const res = await axios.get(`https://lrclib.net/api/get`, {
        params: { artist_name: artist, track_name: track },
      });

      if (res.data && res.data.syncedLyrics) {
        const parsedLyrics = parseLrc(res.data.syncedLyrics);
        setLyrics(parsedLyrics);
        localStorage.setItem(cacheKey, JSON.stringify(parsedLyrics));
        setNoLyrics(false);
        setStatus("playing");
      } else {
        throw new Error("Exact match failed");
      }
    } catch (err) {
      try {
        const searchRes = await axios.get(`https://lrclib.net/api/search`, {
          params: { q: `${track} ${artist}` },
        });
        const match = searchRes.data.find((item) => item.syncedLyrics);

        if (match) {
          const parsedLyrics = parseLrc(match.syncedLyrics);
          setLyrics(parsedLyrics);
          localStorage.setItem(cacheKey, JSON.stringify(parsedLyrics));
          setNoLyrics(false);
          setStatus("playing");
        } else {
          setNoLyrics(true);
          setStatus("playing");
        }
      } catch (searchErr) {
        console.error("Lyrics completely not found", searchErr);
        setNoLyrics(true);
        setStatus("playing");
      }
    }
  };

  const parseLrc = (lrc) => {
    return lrc
      .split("\n")
      .map((line) => {
        const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
        if (match) {
          const minutes = parseInt(match[1]);
          const seconds = parseInt(match[2]);
          const milliseconds = parseInt(match[3]);
          return {
            time: minutes * 60 + seconds + milliseconds / 100,
            text: match[4].trim(),
          };
        }
        return null;
      })
      .filter((l) => l !== null);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans selection:bg-blue-500/30">
      {/* 1. DYNAMIC BACKGROUND */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {geniusData?.artworkUrl ? (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center transition-all duration-1000 scale-110 blur-[100px] opacity-20"
              style={{ backgroundImage: `url(${geniusData.artworkUrl})` }}
            />
            <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
          </>
        ) : (
          <div className="absolute inset-0">
            <Background />
          </div>
        )}
      </div>

      {/* HEADER */}
      <header className="fixed top-0 left-0 right-0 z-20 px-4 py-3 md:px-6 md:py-4 lg:px-8 lg:py-5">
        <div className="flex items-start justify-between gap-4">
          {/* Left: Branding */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
            <div className="bg-[#171717] p-2 shrink-0">
              <Ayotomcs />
            </div>
            <div className="flex flex-col sm:flex-row gap-1 sm:gap-3">
              <h6 className="bg-[#171717] text-base lg:text-lg px-2 py-1 sm:px-3 sm:py-2 w-fit whitespace-nowrap">
                V126
              </h6>
              <h6 className="bg-[#171717] text-base  lg:text-lg px-2 py-1 sm:px-3 sm:py-2 max-w-lg  md:max-w-sm lg:max-w-none">
                A music recognition app that identifies songs and displays
                synced lyrics in real-time.
              </h6>
            </div>
          </div>

          {/* Right: Controls - Show X button when active OR when error shown */}
          {(status !== "idle" || errorMessage) && (
            <div className="flex items-center gap-2 shrink-0">
              {geniusData?.url && (
                <a
                  href={geniusData.url}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 bg-white/10 hover:bg-yellow-400/20 text-white/60 hover:text-yellow-400 transition-all rounded-sm"
                >
                  <ExternalLink className="w-5 h-5" />
                </a>
              )}
              <button
                onClick={() => {
                  setStatus("idle");
                  // Clear data so background resets
                  setGeniusData(null);
                  setSongData(null);
                  setNoLyrics(false);
                  setMood("default");
                  setErrorMessage("");

                  // Clear audio level monitoring
                  if (audioLevelCheckRef.current) {
                    clearInterval(audioLevelCheckRef.current);
                  }

                  if (mediaRecorderRef.current?.state === "recording")
                    mediaRecorderRef.current.stop();
                  if (recordingStream) {
                    recordingStream
                      .getTracks()
                      .forEach((track) => track.stop());
                    setRecordingStream(null);
                  }
                }}
                className="p-2 bg-white/10 hover:bg-red-500/20 text-white/60 hover:text-white transition-all rounded-sm font-bold"
                title="Stop and return home"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </header>

      {/* CARD */}
      <div
        className={cn(
          "w-full max-w-md bg-[#171717] border border-white/5",
          "p-8 min-h-[600px] flex flex-col items-center justify-center relative",
          "z-10 shadow-2xl transition-all duration-700 ease-out overflow-hidden hidden-scrollbar",
          mood === "aggressive" && "shadow-red-900/20 border-red-500/10",
          mood === "default" && "shadow-blue-900/20 border-blue-500/10"
        )}
        style={{ maxHeight: "calc(100vh - 8rem)" }}
      >
        {/* --- STATE: IDLE --- */}
        {status === "idle" && (
          <div className="flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-500">
            <button
              onClick={startRecording}
              className="group relative flex items-center justify-center w-28 h-28 bg-[#4447a9] shadow-2xl hover:scale-105 transition-all cursor-pointer overflow-hidden rounded-sm"
            >
              <Mic className="w-10 h-10 text-white relative z-10" />
            </button>
            <h6 className="text-white font-medium tracking-wide">
              Tap to Identify
            </h6>

            {/* Error Message Display */}
            {errorMessage && (
              <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-sm max-w-[380px] animate-in slide-in-from-bottom-4 duration-500">
                <p className="text-sm text-red-200 leading-relaxed whitespace-pre-line text-center">
                  {errorMessage}
                </p>
              </div>
            )}
          </div>
        )}

        {/* --- STATE: RECORDING --- */}
        {status === "recording" && (
          <div className="flex flex-col items-center gap-6 animate-in fade-in duration-300 w-full">
            <Visualizer stream={recordingStream} />
            <p className="text-zinc-400 text-sm font-medium animate-pulse">
              Listening to environment...
            </p>

            {/* Audio Level Warning */}
            {audioLevel < 15 && (
              <div className="mt-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-sm max-w-[350px] animate-pulse">
                <p className="text-xs text-yellow-200 text-center">
                  ⚠️ Audio signal weak - bring speaker closer
                </p>
              </div>
            )}
          </div>
        )}

        {/* --- STATE: ANALYZING --- */}
        {status === "analyzing" && (
          <div className="flex flex-col items-center gap-6">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
            <p className="text-zinc-400 text-sm">Identifying & Syncing...</p>
          </div>
        )}

        {/* --- STATE: PLAYING --- */}
        {status === "playing" && songData && (
          <div className="w-full h-full flex flex-col pt-4 animate-in fade-in duration-700 relative">
            {/* Song Header */}
            <div className="flex flex-col items-center text-center gap-4 mb-8 flex-shrink-0 z-20 relative">
              <div className="w-32 h-32 shadow-2xl border border-white/10 relative group">
                {geniusData?.artworkUrl ? (
                  <img
                    src={geniusData.artworkUrl}
                    alt="Album Art"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                    <Music className="w-10 h-10 text-zinc-600" />
                  </div>
                )}
              </div>
              <div>
                <h2 className="text-2xl font-bold leading-tight text-white mb-1">
                  {songData.title}
                </h2>
                <p className="text-blue-200/60 font-medium text-lg">
                  {songData.artists[0].name}
                </p>
              </div>
            </div>

            {/* CONTENT AREA: KINETIC TAPE */}
            <div className="flex-1 relative flex flex-col min-h-0">
              {/* 1. HAS LYRICS -> KINETIC TAPE */}
              {!noLyrics && (
                <div className="relative w-full h-[260px] overflow-hidden mask-gradient-vertical-strong">
                  {/* THE TAPE WRAPPER */}
                  <div
                    ref={tapeRef}
                    className="absolute w-full top-1/2 left-0 flex flex-col gap-6"
                  >
                    {lyrics.map((line, i) => {
                      // Optimization: Only render nearby lines to minimalize DOM load,
                      // but keep invisible placeholders if needed for indexing.
                      // Actually, GSAP handles huge lists fine if we don't render them all?
                      // For correctness of offsetTop, we MUST render all previous lines or offset calculation breaks.
                      // So we render ALL but we hide them with opacity.

                      const dist = Math.abs(currentLineIndex - i);
                      const isVisible = dist < 5;
                      const isActive = dist === 0;

                      return (
                        <p
                          key={i}
                          ref={(el) => (lineRefs.current[i] = el)}
                          className={cn(
                            "text-center transition-all duration-700 font-bold tracking-tight leading-relaxed px-4",
                            isActive
                              ? "text-2xl text-white scale-110 drop-shadow-lg"
                              : "text-lg text-zinc-600 blur-[1px] scale-95 opacity-40",
                            !isVisible && "opacity-0"
                          )}
                        >
                          {line.text || "•••"}
                        </p>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2. NO LYRICS -> FALLBACK UI */}
              {noLyrics && (
                <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center px-4">
                  <div className="p-4 bg-zinc-800/50 mb-2">
                    <Sparkles className="w-6 h-6 text-yellow-500/80" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">
                    No Lyrics Available
                  </h3>
                  {geniusData?.url && (
                    <a
                      href={geniusData.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-yellow-400 text-black font-bold text-sm hover:bg-yellow-300 transition-colors"
                    >
                      <span>Open in Genius</span>
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              )}

              {/* 3. STORY MODE: Contextual Trivia (Pinned Bottom) */}
              {geniusData?.description && !noLyrics && (
                <div className="mt-4 mx-4 p-4 bg-white/5 border border-white/5 backdrop-blur-sm animate-in slide-in-from-bottom-20 duration-1000 z-20">
                  <div className="flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-yellow-100/90 mb-1">
                        Did You Know?
                      </p>
                      <p className="text-xs text-white/60 leading-relaxed font-medium line-clamp-2">
                        {geniusData.description
                          .replace(/\[.*?\]/g, "")
                          .slice(0, 180)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

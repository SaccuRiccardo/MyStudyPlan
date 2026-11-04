/** @brief Recognize embeddable YouTube URLs and safe external web links. */
export function classifyAudio(raw) {
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/^m\./, "");
  const youtube = [
    "youtube.com",
    "youtube-nocookie.com",
    "music.youtube.com",
  ].includes(host);
  const short = host === "youtu.be";
  if (!youtube && !short)
    return { kind: "external", url: url.href, player: null };
  let id = "",
    playlist = url.searchParams.get("list") || "";
  if (short) id = url.pathname.split("/")[1] || "";
  else if (url.pathname === "/watch") id = url.searchParams.get("v") || "";
  else if (/^\/(shorts|live|embed)\//.test(url.pathname))
    id = url.pathname.split("/")[2] || "";
  if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) id = "";
  if (!/^[a-zA-Z0-9_-]{10,120}$/.test(playlist)) playlist = "";
  if (!id && !playlist) return null;
  return {
    kind: playlist ? "playlist" : "youtube",
    url: url.href,
    player: playlist
      ? `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(playlist)}&autoplay=1&rel=0`
      : `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
  };
}

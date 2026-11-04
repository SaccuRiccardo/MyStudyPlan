import { createPortal } from "react-dom";
import {
  Headphones,
  Plus,
  Music2,
  Play,
  Trash2,
  ExternalLink,
  X,
  Square,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState } from "react";
import { classifyAudio } from "../lib/audio.js";
import { uid } from "../lib/planner.js";

/** @brief Manage shared favorites and keep the selected media player mounted. */
export default function FocusShelf({ items, onChange }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [minimized, setMinimized] = useState(false);
  const [playing, setPlaying] = useState(null);
  const chosen = items.find((item) => item.id === playing);
  const media = chosen ? classifyAudio(chosen.url) : null;
  /** @brief Validate a favorite link before adding or updating it. */
  const add = (event) => {
    event.preventDefault();
    const parsed = classifyAudio(url);
    if (!title.trim()) return setError("Give this video a name.");
    if (!parsed)
      return setError(
        "Enter a valid YouTube video, playlist, or HTTPS music link.",
      );
    const entry = {
      id: editing || uid(),
      title: title.trim(),
      url: parsed.url,
    };
    onChange(
      editing
        ? items.map((item) => (item.id === editing ? entry : item))
        : [...items, entry],
    );
    setEditing(null);
    setTitle("");
    setUrl("");
    setError("");
    setAdding(false);
  };
  /** @brief Embed supported media or open external media in a separate tab. */
  const play = (item) => {
    const parsed = classifyAudio(item.url);
    if (!parsed) return;
    if (parsed.kind === "external")
      window.open(parsed.url, "_blank", "noopener,noreferrer");
    else setPlaying(item.id);
  };
  return (
    <section className="panel section-panel focus-shelf">
      <div className="section-top">
        <div>
          <span className="panel-overline">SOUNDTRACK</span>
          <h2>
            <Headphones size={19} /> Focus Shelf
          </h2>
        </div>
        <button
          className="small-add"
          onClick={() => {
            setAdding(!adding);
            setEditing(null);
            setTitle("");
            setUrl("");
            setError("");
          }}
        >
          {adding ? (
            <>
              <X size={15} /> Close
            </>
          ) : (
            <>
              <Plus size={15} /> Add
            </>
          )}
        </button>
      </div>
      <p className="card-desc">
        Your favorite background music and study sessions. One click to listen.
      </p>
      <div className="audio-list">
        {items.map((item) => (
          <div
            key={item.id}
            className={`audio-row ${playing === item.id ? "playing" : ""}`}
          >
            <button
              className="audio-launch"
              title={`Open ${item.title}`}
              onClick={() => play(item)}
            >
              <span className="audio-play">
                <Play size={14} fill="currentColor" />
              </span>
              <span className="audio-label">
                <strong>{item.title}</strong>
                <small>
                  {classifyAudio(item.url)?.kind === "playlist"
                    ? "YouTube playlist"
                    : classifyAudio(item.url)?.kind === "youtube"
                      ? "YouTube video"
                      : "External link"}
                </small>
              </span>
            </button>
            <button
              aria-label={`Edit ${item.title}`}
              onClick={() => {
                setEditing(item.id);
                setTitle(item.title);
                setUrl(item.url);
                setAdding(true);
              }}
            >
              Edit
            </button>
            <button
              className="audio-remove"
              title={`Remove ${item.title}`}
              onClick={() => {
                if (!window.confirm(`Remove “${item.title}”?`)) return;
                onChange(items.filter((x) => x.id !== item.id));
                if (playing === item.id) setPlaying(null);
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {!items.length && (
          <p className="empty-small">
            Save a YouTube video or focus music link to start your shelf.
          </p>
        )}
      </div>
      {adding && (
        <form className="audio-form" onSubmit={add}>
          <label>
            Name
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={100}
              placeholder="3h study with me"
            />
          </label>
          <label>
            Link
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              placeholder="https://www.youtube.com/watch?v=..."
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="primary-button">
            Save link
          </button>
        </form>
      )}
      {chosen &&
        media &&
        createPortal(
          <div
            className={`mini-player persistent-player ${minimized ? "is-minimized" : ""}`}
          >
            <div className="mini-player-head">
              <span>
                <Music2 size={15} /> {chosen.title}
              </span>
              <button
                aria-label={minimized ? "Expand player" : "Minimize player"}
                aria-expanded={!minimized}
                onClick={() => setMinimized(!minimized)}
              >
                {minimized ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
              </button>
              <button onClick={() => setPlaying(null)}>
                <Square size={13} /> Stop
              </button>
            </div>
            {media.player && (
              <iframe
                key={`${chosen.id}:${chosen.url}`}
                title={`${chosen.title} player`}
                src={media.player}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            )}
            <a target="_blank" rel="noopener noreferrer" href={chosen.url}>
              Open on YouTube / website <ExternalLink size={12} />
            </a>
          </div>,
          document.body,
        )}
    </section>
  );
}

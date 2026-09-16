import { create } from "zustand";
import { DEFAULT_VIDEO_PROPERTIES, type VideoProperties } from "@/types/video-properties";

export type ProjectStatus = "empty" | "creating" | "uploading" | "transcribing" | "ready" | "error";

type ProjectStore = {
  id: string | null;
  name: string;
  videoUrl: string | null;
  status: ProjectStatus;
  error: string | null;
  /** Id of the selected preview filter (see lib/video/filters.ts), "none" by default. */
  filterId: string;
  /** Manual color-adjustment sliders, layered on top of the filter preset. */
  properties: VideoProperties;

  /** Updates local state and persists to the backend (fire-and-forget). */
  setName: (name: string) => void;
  setVideoUrl: (url: string | null) => void;
  setStatus: (status: ProjectStatus) => void;
  setError: (error: string | null) => void;
  /** Updates local state and persists to the backend (fire-and-forget). */
  setFilterId: (id: string) => void;
  /** Updates local state immediately; persists debounced (sliders fire on every drag tick). */
  setProperties: (properties: VideoProperties) => void;
  /** Persist the video duration once known client-side (fire-and-forget). */
  setDuration: (seconds: number) => void;
  /** Load a persisted project into the store (editor page on mount). */
  hydrate: (project: {
    id: string;
    name: string;
    filterId: string;
    properties: VideoProperties | null;
    videoUrl: string | null;
  }) => void;
  reset: () => void;
};

const initialState = {
  id: null as string | null,
  name: "Untitled Project",
  videoUrl: null as string | null,
  status: "empty" as ProjectStatus,
  error: null as string | null,
  filterId: "none",
  properties: DEFAULT_VIDEO_PROPERTIES,
};

let propertiesDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const PROPERTIES_DEBOUNCE_MS = 400;

export const useProjectStore = create<ProjectStore>((set, get) => ({
  ...initialState,

  setName: (name) => {
    set({ name });
    const { id } = get();
    if (!id) return;
    fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch((err) => console.error("Failed to persist project name:", err));
  },
  setVideoUrl: (videoUrl) => set({ videoUrl }),
  setStatus: (status) => set((s) => ({ status, error: status === "error" ? s.error : null })),
  setError: (error) => set({ error, status: "error" }),

  setFilterId: (filterId) => {
    set({ filterId });
    const { id } = get();
    if (!id) return;
    fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filterId }),
    }).catch((err) => console.error("Failed to persist filter:", err));
  },

  setProperties: (properties) => {
    set({ properties });
    const { id } = get();
    if (!id) return;
    if (propertiesDebounceTimer) clearTimeout(propertiesDebounceTimer);
    propertiesDebounceTimer = setTimeout(() => {
      fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ properties }),
      }).catch((err) => console.error("Failed to persist video properties:", err));
    }, PROPERTIES_DEBOUNCE_MS);
  },

  setDuration: (duration) => {
    const { id } = get();
    if (!id) return;
    fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ duration }),
    }).catch((err) => console.error("Failed to persist duration:", err));
  },

  hydrate: (project) =>
    set({
      id: project.id,
      name: project.name,
      filterId: project.filterId,
      properties: project.properties ?? DEFAULT_VIDEO_PROPERTIES,
      videoUrl: project.videoUrl,
      status: "ready",
      error: null,
    }),

  reset: () => set(initialState),
}));

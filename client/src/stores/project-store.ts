import { create } from "zustand";

export type ProjectStatus = "empty" | "uploading" | "transcribing" | "ready" | "error";

type ProjectStore = {
  name: string;
  videoUrl: string | null;
  status: ProjectStatus;
  error: string | null;
  /** Id of the selected preview filter (see lib/video/filters.ts), "none" by default. */
  filterId: string;

  setName: (name: string) => void;
  setVideoUrl: (url: string | null) => void;
  setStatus: (status: ProjectStatus) => void;
  setError: (error: string | null) => void;
  setFilterId: (id: string) => void;
  reset: () => void;
};

export const useProjectStore = create<ProjectStore>((set) => ({
  name: "Untitled Project",
  videoUrl: null,
  status: "empty",
  error: null,
  filterId: "none",

  setName: (name) => set({ name }),
  setVideoUrl: (videoUrl) => set({ videoUrl }),
  setStatus: (status) => set((s) => ({ status, error: status === "error" ? s.error : null })),
  setError: (error) => set({ error, status: "error" }),
  setFilterId: (filterId) => set({ filterId }),
  reset: () =>
    set({
      name: "Untitled Project",
      videoUrl: null,
      status: "empty",
      error: null,
      filterId: "none",
    }),
}));

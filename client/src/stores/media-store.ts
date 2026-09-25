import { create } from "zustand";
import type { MediaItem } from "@/types/media";

type ApiError = { success: false; error: { message: string } };

type MediaStore = {
  projectId: string | null;
  items: MediaItem[];
  load: (projectId: string) => Promise<void>;
  /** Uploads one file (raw body, like the main video upload), reporting progress 0-1. */
  upload: (file: File, onProgress: (fraction: number) => void) => Promise<MediaItem>;
  /** Throws with the server's message, e.g. when B-roll still uses the file. */
  remove: (id: string) => Promise<void>;
};

/** The project's media library: images and clips used as B-roll. */
export const useMediaStore = create<MediaStore>((set, get) => ({
  projectId: null,
  items: [],

  load: async (projectId) => {
    set({ projectId, items: [] });
    const res = await fetch(`/api/projects/${projectId}/media`);
    const data: { success: true; media: MediaItem[] } | ApiError = await res.json();
    if (data.success && get().projectId === projectId) set({ items: data.media });
  },

  upload: (file, onProgress) =>
    new Promise((resolve, reject) => {
      const { projectId } = get();
      if (!projectId) return reject(new Error("No project loaded."));
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/projects/${projectId}/media?filename=${encodeURIComponent(file.name)}`);
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        let data: { success: true; media: MediaItem } | ApiError;
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          return reject(new Error("Upload failed."));
        }
        if (!data.success) return reject(new Error(data.error.message));
        set((s) => ({ items: [...s.items, data.media] }));
        resolve(data.media);
      };
      xhr.onerror = () => reject(new Error("Upload failed -- is the server running?"));
      xhr.send(file);
    }),

  remove: async (id) => {
    const { projectId } = get();
    if (!projectId) return;
    const res = await fetch(`/api/projects/${projectId}/media/${id}`, { method: "DELETE" });
    const data: { success: true } | ApiError = await res.json();
    if (!data.success) throw new Error(data.error.message);
    set((s) => ({ items: s.items.filter((m) => m.id !== id) }));
  },
}));

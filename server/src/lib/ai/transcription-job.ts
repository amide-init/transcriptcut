import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db/client";
import { resolveInDataDir, statAsset } from "@/lib/storage/local";
import { runFfmpeg, runFfmpegCapturingStderr } from "@/lib/ffmpeg/run";
import { probeDuration } from "@/lib/ffmpeg/probe";
import {
  buildAudioChunkArgs,
  buildExtractAudioArgs,
  buildSilenceDetectArgs,
  parseSilenceDetectOutput,
} from "@/lib/ffmpeg/audio";
import { mergeChunkTranscripts, planChunks, type AudioChunk } from "@/lib/ai/chunking";
import { transcribeFile } from "@/lib/ai/transcribe";
import type { Transcript } from "@/types/transcript";

/** Parallel Whisper calls per job -- enough to cut a long episode's wait, few enough to stay clear of rate limits. */
const CHUNK_CONCURRENCY = 3;

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Runs one transcription job to completion, updating its TranscriptionJob
 * row along the way (queued -> processing -> completed/failed). Called
 * fire-and-forget from the transcribe route, like runRenderJob, so a
 * 2-hour episode never holds an API request open (claude.md section 14).
 *
 * Pipeline: extract a small speech-quality audio track (kept as the
 * project's "audio" asset -- the timeline waveform reads it too), find
 * silences, split into ~10-minute chunks at those silences, transcribe the
 * chunks, then shift and merge them onto the source timeline.
 */
export async function runTranscriptionJob(jobId: string): Promise<void> {
  const chunkPaths: string[] = [];
  try {
    const job = await prisma.transcriptionJob.update({ where: { id: jobId }, data: { status: "processing" } });
    const projectId = job.projectId;

    const originalAsset = await prisma.asset.findFirst({ where: { projectId, kind: "original" } });
    if (!originalAsset) throw new Error("No source video for this project.");

    const audioDir = path.posix.join("projects", projectId, "audio");
    await mkdir(resolveInDataDir(audioDir), { recursive: true });

    const audioRelativePath = path.posix.join(audioDir, "speech.mp3");
    const audioPath = resolveInDataDir(audioRelativePath);
    await runFfmpeg(buildExtractAudioArgs(resolveInDataDir(originalAsset.filePath), audioPath));

    const audioStats = await statAsset(audioRelativePath);
    await prisma.asset.deleteMany({ where: { projectId, kind: "audio" } });
    await prisma.asset.create({
      data: {
        projectId,
        kind: "audio",
        filePath: audioRelativePath,
        mimeType: "audio/mpeg",
        sizeBytes: audioStats.size,
      },
    });

    const duration = await probeDuration(audioPath);
    const silences = parseSilenceDetectOutput(await runFfmpegCapturingStderr(buildSilenceDetectArgs(audioPath)));
    const chunks = planChunks(duration, silences);
    await prisma.transcriptionJob.update({ where: { id: jobId }, data: { totalChunks: chunks.length } });

    const parts = await mapWithConcurrency(chunks, CHUNK_CONCURRENCY, async (chunk: AudioChunk) => {
      const chunkRelativePath = path.posix.join(audioDir, `chunk-${jobId}-${chunk.index}.mp3`);
      const chunkPath = resolveInDataDir(chunkRelativePath);
      chunkPaths.push(chunkPath);

      await runFfmpeg(buildAudioChunkArgs(audioPath, chunkPath, chunk.start, chunk.end - chunk.start));
      const bytes = await readFile(chunkPath);
      const transcript: Transcript = await transcribeFile(
        new File([new Uint8Array(bytes)], path.basename(chunkPath), { type: "audio/mpeg" })
      );
      await rm(chunkPath, { force: true });

      await prisma.transcriptionJob.update({ where: { id: jobId }, data: { completedChunks: { increment: 1 } } });
      return { offset: chunk.start, transcript };
    });

    const merged = mergeChunkTranscripts(parts);
    const segmentsJson = JSON.stringify(merged.segments);
    await prisma.transcript.upsert({
      where: { projectId },
      create: { projectId, segmentsJson },
      update: { segmentsJson },
    });

    await prisma.transcriptionJob.update({ where: { id: jobId }, data: { status: "completed", error: null } });
  } catch (err) {
    logger.error(`Transcription job ${jobId} failed:`, err);
    await prisma.transcriptionJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        error: err instanceof Error ? err.message : "Transcription failed for an unknown reason.",
      },
    });
  } finally {
    await Promise.all(chunkPaths.map((p) => rm(p, { force: true })));
  }
}

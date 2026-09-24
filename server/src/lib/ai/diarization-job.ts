import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db/client";
import { resolveInDataDir } from "@/lib/storage/local";
import { runFfmpeg } from "@/lib/ffmpeg/run";
import { buildAudioChunkArgs } from "@/lib/ffmpeg/audio";
import { probeDuration } from "@/lib/ffmpeg/probe";
import { diarizeFile, type KnownSpeakers } from "@/lib/ai/diarize";
import { assignSpeakers, mergeDiarizedChunks, pickReferenceSpans, type SpeakerSpan } from "@/lib/ai/speakers";
import { extractSpeechAudio, mapWithConcurrency, planSpeechChunks } from "@/lib/ai/transcription-job";
import type { AudioChunk } from "@/lib/ai/chunking";
import type { Transcript } from "@/types/transcript";

/** Parallel diarization calls after the first chunk. */
const CHUNK_CONCURRENCY = 3;
/**
 * How much of the previous chunk each later chunk re-covers, so speaker
 * labels can be matched across the boundary (see lib/ai/speakers.ts
 * #mergeDiarizedChunks). ~7% extra audio on 10-minute chunks.
 */
const OVERLAP_SECONDS = 45;

async function sliceAudio(input: string, output: string, start: number, duration: number): Promise<File> {
  await runFfmpeg(buildAudioChunkArgs(input, output, start, duration));
  const bytes = await readFile(output);
  return new File([new Uint8Array(bytes)], path.basename(output), { type: "audio/mpeg" });
}

/**
 * Speaker detection for an already-transcribed project, as a background job
 * (a TranscriptionJob row with kind "diarize") -- the model runs at roughly
 * half real time (measured: 108s of audio took 50s), far too slow to block
 * a request, and slow enough that it's an explicit button rather than part
 * of every transcription.
 *
 * The first chunk is diarized alone; each of its speakers' longest turn
 * becomes a reference clip, and every later chunk is sent with those clips
 * and re-covers the last OVERLAP_SECONDS of the previous chunk, so the same
 * voice keeps the same label across chunks. Labels are then laid onto the
 * existing Whisper transcript word by word.
 */
export async function runDiarizationJob(jobId: string): Promise<void> {
  const tempPaths: string[] = [];
  try {
    const job = await prisma.transcriptionJob.update({ where: { id: jobId }, data: { status: "processing" } });
    const projectId = job.projectId;

    const record = await prisma.transcript.findUnique({ where: { projectId } });
    if (!record) throw new Error("Transcribe this project before detecting speakers.");

    // Projects transcribed before the audio track existed need it extracted first.
    const audioAsset = await prisma.asset.findFirst({ where: { projectId, kind: "audio" } });
    const audio = audioAsset
      ? {
          audioPath: resolveInDataDir(audioAsset.filePath),
          audioDir: path.posix.dirname(audioAsset.filePath),
          duration: await probeDuration(resolveInDataDir(audioAsset.filePath)),
        }
      : await extractSpeechAudio(projectId);

    const chunks = await planSpeechChunks(audio.audioPath, audio.duration);
    await prisma.transcriptionJob.update({ where: { id: jobId }, data: { totalChunks: chunks.length } });

    const sliceStart = (chunk: AudioChunk) => (chunk.index === 0 ? chunk.start : Math.max(0, chunk.start - OVERLAP_SECONDS));
    const chunkFile = (chunk: AudioChunk) => {
      const chunkPath = resolveInDataDir(path.posix.join(audio.audioDir, `diarize-${jobId}-${chunk.index}.mp3`));
      tempPaths.push(chunkPath);
      const start = sliceStart(chunk);
      return sliceAudio(audio.audioPath, chunkPath, start, chunk.end - start);
    };
    const markChunkDone = () =>
      prisma.transcriptionJob.update({ where: { id: jobId }, data: { completedChunks: { increment: 1 } } });

    // Chunk 0 alone, then rename its speakers to stable reference names.
    const firstSpans = await diarizeFile(await chunkFile(chunks[0]));
    await markChunkDone();
    const referenceSpans = pickReferenceSpans(firstSpans);
    const referenceName = new Map(referenceSpans.map((s, i) => [s.speaker, `speaker_${i + 1}`]));
    const renamedFirst: SpeakerSpan[] = firstSpans.map((s) => ({
      ...s,
      speaker: referenceName.get(s.speaker) ?? s.speaker,
    }));

    const known: KnownSpeakers = { names: [], references: [] };
    for (const [i, span] of referenceSpans.entries()) {
      const refPath = resolveInDataDir(path.posix.join(audio.audioDir, `diarize-${jobId}-ref-${i}.mp3`));
      tempPaths.push(refPath);
      await sliceAudio(audio.audioPath, refPath, chunks[0].start + span.start, span.end - span.start);
      known.names.push(`speaker_${i + 1}`);
      known.references.push(`data:audio/mpeg;base64,${(await readFile(refPath)).toString("base64")}`);
    }

    const laterParts = await mapWithConcurrency(chunks.slice(1), CHUNK_CONCURRENCY, async (chunk) => {
      const spans = await diarizeFile(await chunkFile(chunk), known);
      await markChunkDone();
      return { chunkIndex: chunk.index, offset: sliceStart(chunk), ownFrom: chunk.start, spans };
    });

    const spans = mergeDiarizedChunks(
      [{ chunkIndex: 0, offset: chunks[0].start, ownFrom: chunks[0].start, spans: renamedFirst }, ...laterParts],
      known.names
    );

    // Re-read right before writing, so the newest transcript is labeled even
    // if it changed while the (slow) diarization ran.
    const latest = await prisma.transcript.findUniqueOrThrow({ where: { projectId } });
    const transcript: Transcript = { id: latest.id, segments: JSON.parse(latest.segmentsJson) };
    const labeled = assignSpeakers(transcript, spans);
    await prisma.transcript.update({
      where: { projectId },
      data: { segmentsJson: JSON.stringify(labeled.segments) },
    });

    await prisma.transcriptionJob.update({ where: { id: jobId }, data: { status: "completed", error: null } });
  } catch (err) {
    logger.error(`Speaker detection job ${jobId} failed:`, err);
    await prisma.transcriptionJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        error: err instanceof Error ? err.message : "Speaker detection failed for an unknown reason.",
      },
    });
  } finally {
    await Promise.all(tempPaths.map((p) => rm(p, { force: true })));
  }
}

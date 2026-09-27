/**
 * TranscriptionJob kinds that rewrite the transcript, and so must never
 * run at the same time. Shot detection ("shots") only reads the video.
 */
export const TRANSCRIPT_JOB_KINDS = ["transcribe", "diarize"];

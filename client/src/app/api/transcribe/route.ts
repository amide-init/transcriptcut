import { NextResponse } from "next/server";
import { transcribeFile } from "@/lib/ai/transcribe";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 25 * 1024 * 1024; // Whisper API limit

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("INVALID_REQUEST", "Expected multipart/form-data.", 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return errorResponse("MISSING_FILE", "No file was provided.", 400);
  }
  if (file.size === 0) {
    return errorResponse("EMPTY_FILE", "The uploaded file is empty.", 400);
  }
  if (file.size > MAX_FILE_BYTES) {
    return errorResponse(
      "FILE_TOO_LARGE",
      `File exceeds the ${MAX_FILE_BYTES / (1024 * 1024)}MB transcription limit.`,
      413
    );
  }

  try {
    const transcript = await transcribeFile(file);
    return NextResponse.json({ success: true, transcript });
  } catch (err) {
    console.error("Transcription failed:", err);
    return errorResponse(
      "TRANSCRIPTION_FAILED",
      "The video could not be transcribed. Please try again.",
      502
    );
  }
}

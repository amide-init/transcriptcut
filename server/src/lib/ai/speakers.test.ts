import { describe, expect, it } from "vitest";
import { assignSpeakers, mergeDiarizedChunks, pickReferenceSpans } from "@/lib/ai/speakers";
import type { Transcript } from "@/types/transcript";

const w = (id: string, text: string, start: number, end: number) => ({ id, text, start, end });

describe("mergeDiarizedChunks", () => {
  it("offsets later chunks and keeps known names", () => {
    const spans = mergeDiarizedChunks(
      [
        { chunkIndex: 0, offset: 0, ownFrom: 0, spans: [{ speaker: "speaker_1", start: 0, end: 5 }] },
        { chunkIndex: 1, offset: 600, ownFrom: 600, spans: [{ speaker: "speaker_1", start: 1, end: 4 }] },
      ],
      ["speaker_1"]
    );
    expect(spans).toEqual([
      { speaker: "speaker_1", start: 0, end: 5 },
      { speaker: "speaker_1", start: 601, end: 604 },
    ]);
  });

  it("maps an unknown label to the earlier speaker it overlaps with, and drops the re-covered stretch", () => {
    const spans = mergeDiarizedChunks(
      [
        {
          chunkIndex: 0,
          offset: 0,
          ownFrom: 0,
          spans: [
            { speaker: "speaker_1", start: 0, end: 570 },
            { speaker: "speaker_2", start: 570, end: 600 },
          ],
        },
        {
          // Slice starts at 555: 45s re-covering the previous chunk.
          chunkIndex: 1,
          offset: 555,
          ownFrom: 600,
          spans: [
            { speaker: "A", start: 0, end: 15 }, // 555-570 = speaker_1's voice, but unrecognized
            { speaker: "speaker_2", start: 15, end: 50 },
            { speaker: "A", start: 50, end: 80 },
          ],
        },
      ],
      ["speaker_1", "speaker_2"]
    );
    expect(spans).toEqual([
      { speaker: "speaker_1", start: 0, end: 570 },
      { speaker: "speaker_2", start: 570, end: 600 },
      { speaker: "speaker_2", start: 600, end: 605 },
      { speaker: "speaker_1", start: 605, end: 635 },
    ]);
  });

  it("namespaces a label that matches nobody as a new voice", () => {
    const spans = mergeDiarizedChunks(
      [
        { chunkIndex: 0, offset: 0, ownFrom: 0, spans: [{ speaker: "speaker_1", start: 0, end: 600 }] },
        {
          chunkIndex: 1,
          offset: 555,
          ownFrom: 600,
          spans: [
            { speaker: "speaker_1", start: 0, end: 45 },
            { speaker: "B", start: 50, end: 60 }, // only speaks after the overlap
          ],
        },
      ],
      ["speaker_1"]
    );
    expect(spans.at(-1)).toEqual({ speaker: "chunk1:B", start: 605, end: 615 });
  });
});

describe("pickReferenceSpans", () => {
  it("takes each speaker's longest span, trimmed to 8s, skipping speakers under 2s", () => {
    const refs = pickReferenceSpans([
      { speaker: "A", start: 0, end: 3 },
      { speaker: "A", start: 10, end: 25 },
      { speaker: "B", start: 30, end: 34 },
      { speaker: "C", start: 40, end: 41 },
    ]);
    expect(refs).toEqual([
      { speaker: "A", start: 10, end: 18 },
      { speaker: "B", start: 30, end: 34 },
    ]);
  });

  it("caps at four speakers, the API's limit", () => {
    const spans = ["A", "B", "C", "D", "E"].map((speaker, i) => ({ speaker, start: i * 10, end: i * 10 + 5 }));
    expect(pickReferenceSpans(spans)).toHaveLength(4);
  });
});

describe("assignSpeakers", () => {
  const transcript: Transcript = {
    id: "t",
    segments: [
      {
        id: "s0",
        start: 0,
        end: 6,
        text: "Welcome to the show. Thanks for having me.",
        speaker: "old label",
        words: [
          w("w0", "Welcome", 0, 0.5),
          w("w1", "to", 0.5, 0.7),
          w("w2", "the", 0.7, 0.9),
          w("w3", "show", 0.9, 1.4),
          w("w4", "Thanks", 3, 3.4),
          w("w5", "for", 3.4, 3.6),
          w("w6", "having", 3.6, 4),
          w("w7", "me", 4, 4.3),
        ],
      },
      {
        id: "s1",
        start: 7,
        end: 8,
        text: "Great.",
        words: [w("w8", "Great", 7, 8)],
      },
    ],
  };
  const spans = [
    { speaker: "speaker_1", start: 0, end: 1.5 },
    { speaker: "speaker_2", start: 2.9, end: 4.5 },
    { speaker: "speaker_1", start: 6.8, end: 8.2 },
  ];

  it("splits a segment where the speaker changes, keeping punctuation and word ids", () => {
    const result = assignSpeakers(transcript, spans);
    expect(result.segments.map((s) => [s.speaker, s.text, s.start, s.end])).toEqual([
      ["Speaker 1", "Welcome to the show.", 0, 1.4],
      ["Speaker 2", "Thanks for having me.", 3, 4.3],
      ["Speaker 1", "Great.", 7, 8],
    ]);
    expect(result.segments.flatMap((s) => s.words.map((x) => x.id))).toEqual(
      transcript.segments.flatMap((s) => s.words.map((x) => x.id))
    );
    expect(result.segments.map((s) => s.id)).toEqual(["segment-0", "segment-1", "segment-2"]);
  });

  it("names speakers in order of first appearance, whatever their keys", () => {
    const result = assignSpeakers(
      transcript,
      spans.map((s) => ({ ...s, speaker: s.speaker === "speaker_1" ? "zzz" : "aaa" }))
    );
    expect(result.segments.map((s) => s.speaker)).toEqual(["Speaker 1", "Speaker 2", "Speaker 1"]);
  });

  it("gives a word in a gap between spans the nearest speaker", () => {
    const result = assignSpeakers(transcript, [
      { speaker: "x", start: 0, end: 1 },
      { speaker: "y", start: 5, end: 9 },
    ]);
    // "Thanks for having me" (3-4.3s) sits in the gap, nearer to y (5s) than x (1s).
    expect(result.segments.map((s) => s.speaker)).toEqual(["Speaker 1", "Speaker 2", "Speaker 2"]);
  });

  it("absorbs a one-word blip at a boundary instead of creating a one-word segment", () => {
    const blip = [
      { speaker: "a", start: 0, end: 0.72 },
      { speaker: "b", start: 0.72, end: 0.88 }, // covers just "the"
      { speaker: "a", start: 0.88, end: 5 },
    ];
    const result = assignSpeakers({ ...transcript, segments: [transcript.segments[0]] }, blip);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].speaker).toBe("Speaker 1");
  });

  it("returns the transcript unchanged when there are no spans", () => {
    expect(assignSpeakers(transcript, [])).toBe(transcript);
  });
});

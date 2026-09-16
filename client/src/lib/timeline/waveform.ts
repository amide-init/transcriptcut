/**
 * Peak amplitude (0..1) per bucket for the [start, end) time slice of an
 * AudioBuffer's first channel — used to draw a waveform lane in the timeline.
 */
export function computeRangePeaks(
  buffer: AudioBuffer,
  start: number,
  end: number,
  buckets: number
): number[] {
  const channel = buffer.getChannelData(0);
  const startSample = Math.max(0, Math.floor(start * buffer.sampleRate));
  const endSample = Math.min(channel.length, Math.floor(end * buffer.sampleRate));
  const span = Math.max(1, endSample - startSample);
  const samplesPerBucket = Math.max(1, Math.floor(span / buckets));

  const peaks: number[] = [];
  for (let i = 0; i < buckets; i++) {
    const bucketStart = startSample + i * samplesPerBucket;
    const bucketEnd = Math.min(bucketStart + samplesPerBucket, endSample);
    let peak = 0;
    for (let j = bucketStart; j < bucketEnd; j++) {
      const abs = Math.abs(channel[j]);
      if (abs > peak) peak = abs;
    }
    peaks.push(peak);
  }
  return peaks;
}

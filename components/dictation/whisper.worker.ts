import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

// Only model assets are fetched. Audio and transcripts never leave this worker.
env.allowLocalModels = false;
env.backends.onnx.wasm!.numThreads = 1;
let transcriber: AutomaticSpeechRecognitionPipeline | undefined;

self.onmessage = async ({ data }: MessageEvent<{ type: 'load' | 'transcribe'; audio?: Float32Array }>) => {
  try {
    if (data.type === 'load') {
      const createTranscriber = pipeline<'automatic-speech-recognition'>;
      transcriber = await createTranscriber('automatic-speech-recognition', 'onnx-community/whisper-base', {
        device: 'wasm', dtype: 'q8',
        progress_callback: (progress) => {
          if (progress.status === 'progress') {
            self.postMessage({ type: 'progress', progress: Math.round(progress.progress), file: progress.file });
          }
        },
      });
      self.postMessage({ type: 'ready' });
    } else if (data.type === 'transcribe' && data.audio && transcriber) {
      const result = await transcriber(data.audio, {
        language: 'greek', task: 'transcribe', chunk_length_s: 30, stride_length_s: 5,
        return_timestamps: false,
      });
      self.postMessage({ type: 'result', text: (Array.isArray(result) ? result[0].text : result.text).trim() });
    }
  } catch {
    // Do not log audio, transcripts, or patient context.
    self.postMessage({ type: 'error' });
  }
};

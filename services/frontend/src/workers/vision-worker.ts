/**
 * Web Worker for MediaPipe PoseLandmarker processing.
 *
 * Loads the @mediapipe/tasks-vision from CDN via importScripts,
 * receives ImageBitmap frames from the main thread, and returns
 * FramePose results.
 */
import type { WorkerMessage, FramePose, Landmark } from "../types/analysis";

let poseLandmarker: any = null;

// CDN URL for the MediaPipe vision tasks module
const VISION_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest";

/**
 * Initialize the PoseLandmarker model using CDN-loaded library.
 */
async function initModel(): Promise<void> {
  try {
    // Load MediaPipe tasks-vision from CDN
    // eslint-disable-next-line no-restricted-globals
    importScripts(`${VISION_CDN}/vision_bundle.mjs`);

    // After importScripts, the library is available on the global scope
    const g = self as any;
    const vision = g.vision || g.mediapipe?.tasks?.vision;

    if (!vision) {
      // Try fetching as ES module
      const mod = await import(/* @vite-ignore */ `${VISION_CDN}/vision_bundle.mjs`);
      await initWithModule(mod);
      return;
    }

    await initWithModule(vision);
  } catch (err: unknown) {
    // Fallback: try direct ES module import from CDN
    try {
      const mod = await import(/* @vite-ignore */ `${VISION_CDN}/vision_bundle.mjs`);
      await initWithModule(mod);
    } catch (err2: unknown) {
      const message = err2 instanceof Error ? err2.message : "Failed to load MediaPipe";
      self.postMessage({ type: "error", message } satisfies WorkerMessage);
    }
  }
}

async function initWithModule(vision: any): Promise<void> {
  const { PoseLandmarker, FilesetResolver } = vision;

  const wasmFileset = await FilesetResolver.forVisionTasks(
    `${VISION_CDN}/wasm`,
  );

  poseLandmarker = await PoseLandmarker.createFromOptions(wasmFileset, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
      delegate: "GPU",
    },
    runningMode: "IMAGE",
    numPoses: 1,
  });

  self.postMessage({ type: "ready" } satisfies WorkerMessage);
}

/**
 * Process a single video frame and extract pose landmarks.
 */
function processFrame(
  bitmap: ImageBitmap,
  frameIndex: number,
  timestampMs: number,
): FramePose | null {
  if (!poseLandmarker) return null;

  try {
    const result = poseLandmarker.detect(bitmap);
    bitmap.close();

    if (!result.landmarks || result.landmarks.length === 0) {
      return null;
    }

    const rawLandmarks = result.landmarks[0];
    const worldLandmarks = result.worldLandmarks?.[0];

    const landmarks: Landmark[] = rawLandmarks.map(
      (lm: any, i: number) => ({
        x: lm.x as number,
        y: lm.y as number,
        z: worldLandmarks?.[i]?.z ?? (lm.z as number),
        visibility: lm.visibility ?? 0.5,
      }),
    );

    return { frameIndex, timestampMs, landmarks };
  } catch {
    return null;
  }
}

// ── Message handler ─────────────────────────────────────────────────────

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case "init":
      await initModel();
      break;

    case "processFrame": {
      const pose = processFrame(msg.bitmap, msg.frameIndex, msg.timestampMs);
      if (pose) {
        self.postMessage({ type: "frameResult", pose } satisfies WorkerMessage);
      }
      break;
    }

    case "done":
      break;
  }
};

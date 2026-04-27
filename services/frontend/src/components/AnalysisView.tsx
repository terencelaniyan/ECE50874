import { useState, useRef, useCallback, useEffect } from "react";
import type {
  AnalysisPhase,
  FramePose,
  BowlingKinematics,
  FormEvaluation,
  WorkerMessage,
} from "../types/analysis";
import {
  extractKinematics,
  evaluateForm,
  detectBowlingHand,
} from "../utils/bowling-kinematics";
import { VideoUploader } from "./analysis/VideoUploader";
import { PoseOverlay } from "./analysis/PoseOverlay";
import { FrameScrubber } from "./analysis/FrameScrubber";
import { AnalysisResults } from "./analysis/AnalysisResults";
import { BaselineComparison } from "./analysis/BaselineComparison";
import { FormFeedback } from "./analysis/FormFeedback";

const FPS = 30;
const FRAME_SKIP = 3; // process every 3rd frame initially

interface Props {
  onSimulateParams?: (params: {
    speed: number;
    revRate: number;
    launchAngle: number;
  }) => void;
}

export function AnalysisView({ onSimulateParams }: Props) {
  const [phase, setPhase] = useState<AnalysisPhase>("idle");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const [framePoses, setFramePoses] = useState<FramePose[]>([]);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [kinematics, setKinematics] = useState<BowlingKinematics | null>(null);
  const [formEval, setFormEval] = useState<FormEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [videoDimensions, setVideoDimensions] = useState({ w: 640, h: 480 });

  const videoRef = useRef<HTMLVideoElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const canvasExtractRef = useRef<HTMLCanvasElement | null>(null);
  const processingFailedRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  /** Extract frames from video and send to worker. */
  const processVideo = useCallback(async (file: File) => {
    try {
      setPhase("uploading");
      setError(null);
      setFramePoses([]);
      setKinematics(null);
      setFormEval(null);
      processingFailedRef.current = false;

      // Create object URL for video playback
      const url = URL.createObjectURL(file);
      setVideoUrl(url);

      // Wait for video metadata
      const vid = videoRef.current;
      if (!vid) return;

      vid.src = url;
      await new Promise<void>((resolve) => {
        vid.onloadedmetadata = () => resolve();
      });

      const w = vid.videoWidth;
      const h = vid.videoHeight;
      setVideoDimensions({ w, h });
      const duration = vid.duration;
      const totalFrames = Math.ceil(duration * FPS);

      setPhase("processing");
      setProgress({ processed: 0, total: Math.ceil(totalFrames / FRAME_SKIP) });

      // Create offscreen canvas for frame extraction
      if (!canvasExtractRef.current) {
        canvasExtractRef.current = document.createElement("canvas");
      }
      const canvas = canvasExtractRef.current;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;

      // Try Web Worker first, fall back to main-thread processing
      let useWorker = false;
      try {
        const worker = new Worker(
          new URL("../workers/vision-worker.ts", import.meta.url),
          { type: "module" },
        );
        workerRef.current = worker;

        const workerReady = await new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => resolve(false), 10000);
          worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
            if (e.data.type === "ready") {
              clearTimeout(timeout);
              resolve(true);
            } else if (e.data.type === "error") {
              clearTimeout(timeout);
              resolve(false);
            }
          };
          worker.postMessage({ type: "init" } satisfies WorkerMessage);
        });

        useWorker = workerReady;
      } catch {
        useWorker = false;
      }

      if (useWorker) {
        // Worker-based processing
        await processWithWorker(vid, canvas, ctx, totalFrames, w, h);
      } else {
        // Main-thread fallback — process without MediaPipe, just extract frame timestamps
        // This allows the UI to work even without MediaPipe
        await processMainThread(vid, canvas, ctx, totalFrames);
      }
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Video analysis failed unexpectedly.";
      processingFailedRef.current = true;
      setError(message);
      setPhase("error");
    }
  }, []);

  /** Process frames using the Web Worker with MediaPipe. */
  const processWithWorker = useCallback(
    async (
      video: HTMLVideoElement,
      canvas: HTMLCanvasElement,
      ctx: CanvasRenderingContext2D,
      totalFrames: number,
      w: number,
      h: number,
    ) => {
      const worker = workerRef.current!;
      const poses: FramePose[] = [];
      let processed = 0;
      const targetFrames = Math.ceil(totalFrames / FRAME_SKIP);

      worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
        if (e.data.type === "frameResult") {
          poses.push(e.data.pose);
          processed++;
          setProgress({ processed, total: targetFrames });
        } else if (e.data.type === "error") {
          processingFailedRef.current = true;
          setError(e.data.message);
          setPhase("error");
        }
      };

      for (let i = 0; i < totalFrames; i += FRAME_SKIP) {
        const time = i / FPS;
        video.currentTime = time;
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            video.removeEventListener("seeked", onSeeked);
            resolve();
          };
          video.addEventListener("seeked", onSeeked);
          setTimeout(resolve, 500); // timeout fallback
        });

        ctx.drawImage(video, 0, 0, w, h);
        try {
          const bitmap = await createImageBitmap(canvas);
          worker.postMessage(
            {
              type: "processFrame",
              frameIndex: i,
              timestampMs: Math.round(time * 1000),
              bitmap,
            } satisfies WorkerMessage,
            [bitmap],
          );
        } catch {
          // Skip frame if bitmap creation fails
        }
      }

      if (processingFailedRef.current) return;

      // Wait for remaining results
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      if (processingFailedRef.current) return;

      poses.sort((a, b) => a.frameIndex - b.frameIndex);
      finishAnalysis(poses);
    },
    [],
  );

  /** Main-thread fallback — no MediaPipe, uses placeholder poses. */
  const processMainThread = useCallback(
    async (
      _video: HTMLVideoElement,
      _canvas: HTMLCanvasElement,
      _ctx: CanvasRenderingContext2D,
      totalFrames: number,
    ) => {
      // Without MediaPipe, we can't extract poses.
      // Show a message asking to install the dependency.
      setError(
        "MediaPipe PoseLandmarker could not be loaded. " +
        "Video uploaded successfully — pose analysis requires a compatible browser with WebGPU/WebGL support.",
      );
      setProgress({ processed: 0, total: 0 });

      // Create empty frame references so video scrubbing still works
      const poses: FramePose[] = [];
      for (let i = 0; i < totalFrames; i += FRAME_SKIP) {
        poses.push({
          frameIndex: i,
          timestampMs: Math.round((i / FPS) * 1000),
          landmarks: [],
        });
      }

      setFramePoses(poses);
      setPhase("reviewing");
    },
    [],
  );

  /** Compute kinematics and form evaluation from collected poses. */
  const finishAnalysis = useCallback((poses: FramePose[]) => {
    setFramePoses(poses);

    if (poses.length > 0 && poses[0].landmarks.length > 0) {
      const kin = extractKinematics(poses, { fps: FPS });
      setKinematics(kin);

      if (kin) {
        const releaseIdx = poses.findIndex(
          (p) => p.frameIndex === kin.releaseFrameIndex,
        );
        if (releaseIdx >= 0) {
          setFormEval(evaluateForm(poses, releaseIdx));
        }
      }
    }

    setPhase("reviewing");
  }, []);

  /** Seek video to a specific frame. */
  const handleSeek = useCallback(
    (frame: number) => {
      setCurrentFrame(frame);
      const video = videoRef.current;
      if (video && framePoses.length > 0) {
        // Find the closest frame pose
        const closest = framePoses.reduce((prev, curr) =>
          Math.abs(curr.frameIndex - frame) < Math.abs(prev.frameIndex - frame)
            ? curr
            : prev,
        );
        video.currentTime = closest.timestampMs / 1000;
      }
    },
    [framePoses],
  );

  /** Reset to allow new upload. */
  const handleReset = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setPhase("idle");
    setFramePoses([]);
    setKinematics(null);
    setFormEval(null);
    setError(null);
    setCurrentFrame(0);
  }, [videoUrl]);

  const currentPose = framePoses.find(
    (p) => p.frameIndex === currentFrame,
  ) ?? framePoses.reduce<FramePose | null>(
    (prev, curr) => {
      if (!prev) return curr;
      return Math.abs(curr.frameIndex - currentFrame) <
        Math.abs(prev.frameIndex - currentFrame)
        ? curr
        : prev;
    },
    null,
  );

  const releaseFrameIndex = kinematics?.releaseFrameIndex;
  const bowlingHand = framePoses.length > 0 && framePoses[0].landmarks.length > 0
    ? detectBowlingHand(framePoses)
    : "right";

  return (
    <div className="analysis-layout">
      <div className="analysis-header">
        <div className="panel-header">
          <div className="panel-title">Video Analysis</div>
          <div className="panel-badge">PHASE 2 — VISION</div>
        </div>
      </div>

      {phase === "idle" && (
        <VideoUploader onFileSelected={processVideo} />
      )}

      {phase === "uploading" && (
        <div className="analysis-status">
          <div className="status-spinner" />
          <div>Loading video...</div>
        </div>
      )}

      {phase === "processing" && (
        <div className="analysis-status">
          <div className="status-spinner" />
          <div>
            Processing frames... {progress.processed} / {progress.total}
          </div>
          <div className="progress-bar-wrap">
            <div
              className="progress-bar-fill"
              style={{
                width: `${
                  progress.total > 0
                    ? (progress.processed / progress.total) * 100
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      )}

      {phase === "reviewing" && (
        <>
          <div className="analysis-video-area">
            <div
              className="video-container"
              style={{ width: videoDimensions.w, maxWidth: "100%" }}
            >
              <video
                ref={videoRef}
                className="analysis-video"
                width={videoDimensions.w}
                height={videoDimensions.h}
                muted
                playsInline
              />
              {currentPose && currentPose.landmarks.length > 0 && (
                <PoseOverlay
                  pose={currentPose}
                  releaseFrameIndex={releaseFrameIndex}
                  bowlingHand={bowlingHand}
                  width={videoDimensions.w}
                  height={videoDimensions.h}
                />
              )}
            </div>
            <FrameScrubber
              currentFrame={currentFrame}
              totalFrames={framePoses.length > 0
                ? framePoses[framePoses.length - 1].frameIndex + 1
                : 0}
              releaseFrame={releaseFrameIndex}
              onSeek={handleSeek}
              fps={FPS}
            />
          </div>

          {error && (
            <div className="analysis-warning">
              <span className="warn-icon">{"\u26A0"}</span> {error}
            </div>
          )}

          <div className="analysis-results-area">
            {kinematics && (
              <>
                <AnalysisResults kinematics={kinematics} />
                <BaselineComparison kinematics={kinematics} />
                {onSimulateParams && (
                  <button
                    type="button"
                    className="sim-btn analysis-sim-btn"
                    onClick={() =>
                      onSimulateParams({
                        speed: kinematics.ballSpeedMph,
                        revRate: kinematics.revRateRpm,
                        launchAngle: kinematics.launchAngleDeg,
                      })
                    }
                  >
                    Simulate This Delivery
                  </button>
                )}
              </>
            )}
            {formEval && <FormFeedback evaluation={formEval} />}
          </div>

          <button
            type="button"
            className="reset-btn"
            onClick={handleReset}
          >
            Analyze Another Video
          </button>
        </>
      )}

      {phase === "error" && (
        <div className="analysis-error">
          <p>{error}</p>
          <button type="button" className="reset-btn" onClick={handleReset}>
            Try Again
          </button>
        </div>
      )}

      {/* Hidden video for processing */}
      {phase !== "reviewing" && (
        <video
          ref={videoRef}
          style={{ display: "none" }}
          muted
          playsInline
        />
      )}
    </div>
  );
}

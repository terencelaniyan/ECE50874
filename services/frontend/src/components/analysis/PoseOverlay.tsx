import { useRef, useEffect, useCallback } from "react";
import type { FramePose } from "../../types/analysis";
import { POSE_LANDMARKS } from "../../constants/baselines";

/** Connections to draw between landmarks (skeleton). */
const SKELETON_CONNECTIONS: [number, number][] = [
  [POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.RIGHT_SHOULDER],
  [POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.LEFT_ELBOW],
  [POSE_LANDMARKS.LEFT_ELBOW, POSE_LANDMARKS.LEFT_WRIST],
  [POSE_LANDMARKS.RIGHT_SHOULDER, POSE_LANDMARKS.RIGHT_ELBOW],
  [POSE_LANDMARKS.RIGHT_ELBOW, POSE_LANDMARKS.RIGHT_WRIST],
  [POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.LEFT_HIP],
  [POSE_LANDMARKS.RIGHT_SHOULDER, POSE_LANDMARKS.RIGHT_HIP],
  [POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.RIGHT_HIP],
  [POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.LEFT_KNEE],
  [POSE_LANDMARKS.LEFT_KNEE, POSE_LANDMARKS.LEFT_ANKLE],
  [POSE_LANDMARKS.RIGHT_HIP, POSE_LANDMARKS.RIGHT_KNEE],
  [POSE_LANDMARKS.RIGHT_KNEE, POSE_LANDMARKS.RIGHT_ANKLE],
];

interface Props {
  pose: FramePose | null;
  releaseFrameIndex?: number;
  bowlingHand?: "left" | "right";
  width: number;
  height: number;
}

export function PoseOverlay({
  pose,
  releaseFrameIndex,
  bowlingHand = "right",
  width,
  height,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pose) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    const lms = pose.landmarks;

    // Draw skeleton connections
    ctx.strokeStyle = "rgba(232, 255, 60, 0.6)";
    ctx.lineWidth = 2;
    for (const [a, b] of SKELETON_CONNECTIONS) {
      const la = lms[a];
      const lb = lms[b];
      if (!la || !lb || la.visibility < 0.3 || lb.visibility < 0.3) continue;
      ctx.beginPath();
      ctx.moveTo(la.x * width, la.y * height);
      ctx.lineTo(lb.x * width, lb.y * height);
      ctx.stroke();
    }

    // Draw landmark dots
    for (let i = 0; i < lms.length; i++) {
      const lm = lms[i];
      if (!lm || lm.visibility < 0.3) continue;
      const isWrist =
        (bowlingHand === "right" && i === POSE_LANDMARKS.RIGHT_WRIST) ||
        (bowlingHand === "left" && i === POSE_LANDMARKS.LEFT_WRIST);
      ctx.beginPath();
      ctx.arc(lm.x * width, lm.y * height, isWrist ? 6 : 3, 0, Math.PI * 2);
      ctx.fillStyle = isWrist
        ? "var(--accent2, #ff5c38)"
        : "var(--accent, #e8ff3c)";
      ctx.fill();
    }

    // Mark release frame
    if (releaseFrameIndex !== undefined && pose.frameIndex === releaseFrameIndex) {
      ctx.font = "bold 14px 'DM Mono', monospace";
      ctx.fillStyle = "var(--accent2, #ff5c38)";
      ctx.fillText("RELEASE", 10, 24);
    }
  }, [pose, releaseFrameIndex, bowlingHand, width, height]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className="pose-overlay-canvas"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width,
        height,
        pointerEvents: "none",
      }}
    />
  );
}

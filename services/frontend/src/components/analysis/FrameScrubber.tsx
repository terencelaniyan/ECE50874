interface Props {
  currentFrame: number;
  totalFrames: number;
  releaseFrame?: number;
  onSeek: (frame: number) => void;
  fps: number;
}

export function FrameScrubber({
  currentFrame,
  totalFrames,
  releaseFrame,
  onSeek,
  fps,
}: Props) {
  const releasePercent =
    releaseFrame !== undefined && totalFrames > 0
      ? (releaseFrame / totalFrames) * 100
      : null;

  const currentTime = fps > 0 ? (currentFrame / fps).toFixed(2) : "0.00";
  const totalTime = fps > 0 ? (totalFrames / fps).toFixed(2) : "0.00";

  return (
    <div className="frame-scrubber">
      <div className="scrubber-track-wrap">
        <input
          type="range"
          min={0}
          max={Math.max(0, totalFrames - 1)}
          value={currentFrame}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="scrubber-input"
        />
        {releasePercent !== null && (
          <div
            className="scrubber-release-marker"
            style={{ left: `${releasePercent}%` }}
            title={`Release frame ${releaseFrame}`}
          />
        )}
      </div>
      <div className="scrubber-info">
        <span className="scrubber-time">{currentTime}s / {totalTime}s</span>
        <span className="scrubber-frame">Frame {currentFrame + 1} / {totalFrames}</span>
        <div className="scrubber-step-btns">
          <button
            type="button"
            className="step-btn"
            onClick={() => onSeek(Math.max(0, currentFrame - 1))}
            title="Previous frame"
          >
            &lt;
          </button>
          <button
            type="button"
            className="step-btn"
            onClick={() => onSeek(Math.min(totalFrames - 1, currentFrame + 1))}
            title="Next frame"
          >
            &gt;
          </button>
          {releaseFrame !== undefined && (
            <button
              type="button"
              className="step-btn release-btn"
              onClick={() => onSeek(releaseFrame)}
              title="Go to release frame"
            >
              REL
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

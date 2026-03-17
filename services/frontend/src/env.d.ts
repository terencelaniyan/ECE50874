/// <reference types="vite/client" />

// Web Worker global scope
declare function importScripts(...urls: string[]): void;

// @dimforge/rapier3d-compat has its own type definitions — no manual declaration needed

declare module "@mediapipe/tasks-vision" {
  export class PoseLandmarker {
    static createFromOptions(fileset: any, options: any): Promise<PoseLandmarker>;
    detect(image: ImageBitmap | HTMLVideoElement | HTMLImageElement): any;
  }
  export class FilesetResolver {
    static forVisionTasks(wasmPath: string): Promise<any>;
  }
}

interface ImportMetaEnv {
  readonly VITE_API_BASE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

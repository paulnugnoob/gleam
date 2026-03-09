export interface StageTiming {
  stage: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
}

export interface TimingReport {
  analysisId?: number;
  videoUrl?: string;
  extractionMode: "fixed_fps" | "scene_change";
  stages: StageTiming[];
  totalDurationMs: number;
  frameCount: number;
  videoDurationSec: number;
  summary: {
    download: number;
    frameExtraction: number;
    audioExtraction: number;
    aiAnalysis: number;
    productMatching: number;
    dbOperations: number;
  };
}

export class AnalysisTimer {
  private stages: StageTiming[] = [];
  private currentStage: StageTiming | null = null;
  private startTime: number;
  private extractionMode: "fixed_fps" | "scene_change" = "fixed_fps";
  private frameCount: number = 0;
  private videoDuration: number = 0;
  private analysisId?: number;
  private videoUrl?: string;

  constructor() {
    this.startTime = Date.now();
  }

  setExtractionMode(mode: "fixed_fps" | "scene_change"): void {
    this.extractionMode = mode;
  }

  setAnalysisId(id: number): void {
    this.analysisId = id;
  }

  setVideoUrl(url: string): void {
    this.videoUrl = url;
  }

  setFrameCount(count: number): void {
    this.frameCount = count;
  }

  setVideoDuration(duration: number): void {
    this.videoDuration = duration;
  }

  startStage(stage: string): void {
    if (this.currentStage) {
      this.endStage();
    }
    this.currentStage = {
      stage,
      startTime: Date.now(),
    };
  }

  endStage(): void {
    if (this.currentStage) {
      this.currentStage.endTime = Date.now();
      this.currentStage.durationMs =
        this.currentStage.endTime - this.currentStage.startTime;
      this.stages.push(this.currentStage);
      this.currentStage = null;
    }
  }

  private getStageDuration(stagePrefix: string): number {
    return this.stages
      .filter((s) => s.stage.startsWith(stagePrefix))
      .reduce((sum, s) => sum + (s.durationMs || 0), 0);
  }

  getReport(): TimingReport {
    if (this.currentStage) {
      this.endStage();
    }

    const totalDurationMs = Date.now() - this.startTime;

    return {
      analysisId: this.analysisId,
      videoUrl: this.videoUrl,
      extractionMode: this.extractionMode,
      stages: this.stages,
      totalDurationMs,
      frameCount: this.frameCount,
      videoDurationSec: this.videoDuration,
      summary: {
        download: this.getStageDuration("download"),
        frameExtraction: this.getStageDuration("frame_extraction"),
        audioExtraction: this.getStageDuration("audio"),
        aiAnalysis: this.getStageDuration("ai_"),
        productMatching: this.getStageDuration("product_"),
        dbOperations: this.getStageDuration("db_"),
      },
    };
  }

  logReport(): void {
    const report = this.getReport();

    console.log("\n" + "=".repeat(60));
    console.log("ANALYSIS TIMING REPORT");
    console.log("=".repeat(60));
    console.log(
      JSON.stringify(
        {
          type: "timing_report",
          ...report,
        },
        null,
        2,
      ),
    );
    console.log("=".repeat(60));

    console.log("\nSUMMARY:");
    console.log(`  Analysis ID:      ${report.analysisId || "N/A"}`);
    console.log(`  Extraction Mode:  ${report.extractionMode}`);
    console.log(`  Video Duration:   ${report.videoDurationSec.toFixed(1)}s`);
    console.log(`  Frames Extracted: ${report.frameCount}`);
    console.log(
      `  Total Time:       ${(report.totalDurationMs / 1000).toFixed(2)}s`,
    );
    console.log("\nBREAKDOWN:");
    console.log(
      `  Download:         ${(report.summary.download / 1000).toFixed(2)}s`,
    );
    console.log(
      `  Frame Extraction: ${(report.summary.frameExtraction / 1000).toFixed(2)}s`,
    );
    console.log(
      `  Audio Extraction: ${(report.summary.audioExtraction / 1000).toFixed(2)}s`,
    );
    console.log(
      `  AI Analysis:      ${(report.summary.aiAnalysis / 1000).toFixed(2)}s`,
    );
    console.log(
      `  Product Matching: ${(report.summary.productMatching / 1000).toFixed(2)}s`,
    );
    console.log(
      `  DB Operations:    ${(report.summary.dbOperations / 1000).toFixed(2)}s`,
    );
    console.log("=".repeat(60) + "\n");
  }
}

export function createTimer(): AnalysisTimer {
  return new AnalysisTimer();
}

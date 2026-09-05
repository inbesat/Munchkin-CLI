import { DiffResultStructured } from './compute';
/** Render options. */
export interface RenderDiffOptions {
    /** Language for syntax highlighting. */
    language?: string;
    /** Theme for syntax highlighting. */
    theme?: string;
    /** Include line numbers. */
    lineNumbers?: boolean;
    /** Output format. */
    format?: 'ansi' | 'html';
}
/** Render a diff with simple ANSI colors (no syntax highlighting for now). */
export declare function renderDiff(diff: DiffResultStructured, options?: RenderDiffOptions): Promise<string>;
/** Detect language from file extension. */
export declare function detectLanguage(filePath: string): string;
/** Render diff with auto-detected language. */
export declare function renderDiffAuto(diff: DiffResultStructured, filePath: string, options?: Omit<RenderDiffOptions, 'language'>): Promise<string>;
/** Quick diff and render in one call. */
export declare function diffAndRender(oldContent: string, newContent: string, filePath: string, options?: RenderDiffOptions & {
    computeOptions?: import('./compute').ComputeDiffOptions;
}): Promise<string>;
//# sourceMappingURL=render.d.ts.map
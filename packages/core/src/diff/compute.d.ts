/** Diff format options. */
export type DiffFormat = 'unified' | 'side-by-side' | 'inline';
/** Diff algorithm options. */
export type DiffAlgorithm = 'lines' | 'words' | 'chars';
/** A single diff hunk. */
export interface DiffHunk {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: DiffLine[];
}
/** A single line in a diff. */
export interface DiffLine {
    type: 'context' | 'add' | 'remove';
    content: string;
    oldLineNumber?: number;
    newLineNumber?: number;
}
/** Complete diff result. */
export interface DiffResultStructured {
    hunks: DiffHunk[];
    oldFile: string;
    newFile: string;
    format: DiffFormat;
}
/** Options for diff computation. */
export interface ComputeDiffOptions {
    /** Diff format. */
    format?: DiffFormat;
    /** Diff algorithm granularity. */
    algorithm?: DiffAlgorithm;
    /** Number of context lines around changes. */
    contextLines?: number;
    /** Ignore whitespace differences. */
    ignoreWhitespace?: boolean;
    /** Maximum file size to diff (bytes). */
    maxSize?: number;
}
/**
 * Compute a diff between two strings.
 */
export declare function computeDiff(oldContent: string, newContent: string, options?: ComputeDiffOptions): DiffResultStructured;
/** Convert structured diff to unified diff string. */
export declare function formatUnifiedDiff(diff: DiffResultStructured, oldName?: string, newName?: string): string;
/** Convert structured diff to side-by-side string. */
export declare function formatSideBySideDiff(diff: DiffResultStructured): string;
/** Convert structured diff to inline string. */
export declare function formatInlineDiff(diff: DiffResultStructured): string;
/** Format diff according to specified format. */
export declare function formatDiff(diff: DiffResultStructured, oldName?: string, newName?: string): string;
//# sourceMappingURL=compute.d.ts.map
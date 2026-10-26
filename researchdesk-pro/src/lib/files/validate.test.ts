import { describe, expect, it } from "vitest";
import { checkUpload, contentMatches, MAX_UPLOAD_BYTES, safeFileName, sniff, storageKey } from "@/lib/files/validate";

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31);
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);
const EXE = bytes(0x4d, 0x5a);

describe("upload validation", () => {
  it("accepts supported extensions within the size limit", () => {
    expect(checkUpload("Thesis Draft.DOCX", 1024)).toEqual({ kind: "docx" });
    expect(checkUpload("data.xlsx", MAX_UPLOAD_BYTES)).toEqual({ kind: "xlsx" });
  });

  it("rejects other types, empty files and oversize files", () => {
    expect(checkUpload("setup.exe", 10)).toEqual({ problem: "unsupported_type" });
    expect(checkUpload("notes.doc", 10)).toEqual({ problem: "unsupported_type" });
    expect(checkUpload("a.pdf", 0)).toEqual({ problem: "empty" });
    expect(checkUpload("a.pdf", MAX_UPLOAD_BYTES + 1)).toEqual({ problem: "too_large" });
  });

  it("identifies content by its magic bytes", () => {
    expect(sniff(PDF)).toBe("pdf");
    expect(sniff(PNG)).toBe("png");
    expect(sniff(WEBP)).toBe("webp");
    expect(sniff(ZIP)).toBe("zip");
    expect(sniff(EXE)).toBeNull();
  });

  it("rejects content that does not match the extension", () => {
    expect(contentMatches("pdf", PDF)).toBe(true);
    expect(contentMatches("docx", ZIP)).toBe(true);
    expect(contentMatches("pdf", EXE)).toBe(false);
    expect(contentMatches("png", PDF)).toBe(false);
    expect(contentMatches("pdf", ZIP)).toBe(false);
  });

  it("strips paths and control characters from display names", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\Users\\a\\report<1>.pdf")).toBe("report1.pdf");
    expect(safeFileName("...hidden")).toBe("hidden");
    expect(safeFileName("بحث  التخرج.pdf")).toBe("بحث التخرج.pdf");
  });

  it("builds storage keys from ids, never from the client's file name", () => {
    expect(storageKey("order-1", "file-2", "jpeg")).toBe("order-1/file-2.jpg");
  });
});

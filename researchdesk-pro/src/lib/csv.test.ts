import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";

describe("csv", () => {
  it("neutralizes spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@sum")).toBe("'@sum");
  });

  it("quotes commas, quotes and newlines and leaves plain text alone", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell("بحث")).toBe("بحث");
    expect(csvCell(null)).toBe("");
    expect(csvCell(12.5)).toBe("12.5");
  });

  it("joins rows with CRLF", () => {
    expect(toCsv(["a", "b"], [[1, "x"]])).toBe("a,b\r\n1,x\r\n");
  });
});

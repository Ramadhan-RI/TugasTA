// backend/helpers/fileHelper.js
const pdf = require("pdf-parse");
const mammoth = require("mammoth");
const fs = require("fs").promises;

async function extractText(filePath, mimeType) {
  try {
    const dataBuffer = await fs.readFile(filePath);
    if (mimeType === "application/pdf") {
      const data = await pdf(dataBuffer);
      return data.text;
    } else if (
      mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      // DOCX
      const result = await mammoth.extractRawText({ buffer: dataBuffer });
      return result.value;
    } else if (mimeType.startsWith("text/")) {
      // TXT, CSV, etc.
      return dataBuffer.toString("utf8");
    } else {
      console.warn(`Unsupported mime type for text extraction: ${mimeType}`);
      return null; // Atau throw error jika wajib bisa diekstrak
    }
  } catch (error) {
    console.error(`Error extracting text from ${filePath}:`, error);
    throw new Error("Failed to extract text from file");
  }
}

module.exports = { extractText };

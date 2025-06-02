// backend/helpers/hashHelper.js
const { sha3_256 } = require("js-sha3");
const fs = require("fs").promises; // Gunakan fs promises

async function calculateSHA3FromFile(filePath) {
  try {
    const fileBuffer = await fs.readFile(filePath);
    const hash = sha3_256(fileBuffer);
    return hash;
  } catch (error) {
    console.error(`Error reading file for hashing: ${filePath}`, error);
    throw new Error("Failed to calculate hash from file");
  }
}

module.exports = { calculateSHA3FromFile };

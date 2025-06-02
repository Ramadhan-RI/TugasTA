// backend/controllers/documentController.js
const db = require("../config/db");
const { calculateSHA3FromFile } = require("../helpers/hashHelper");
const { extractText } = require("../helpers/fileHelper");
const { calculateSimilarity } = require("../helpers/nlpHelper");
const fs = require("fs").promises;
const path = require("path");

const UPLOAD_DIR = path.join(__dirname, "..", "uploads"); // Path absolut ke folder uploads

// Upload dokumen asli
exports.uploadOriginalDocument = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded." });
  }

  const { originalname, filename: stored_filename, mimetype, size } = req.file;
  const filePath = path.join(UPLOAD_DIR, stored_filename);

  try {
    // --- PENGECEKAN DUPLIKAT original_filename ---
    const [existingFiles] = await db.query(
      "SELECT id FROM documents WHERE original_filename = ?",
      [originalname]
    );
    if (existingFiles.length > 0) {
      // Hapus file yang baru diupload karena duplikat
      await fs.unlink(filePath);
      return res.status(409).json({
        // 409 Conflict
        message: `Dokumen dengan nama "${originalname}" sudah ada. Tidak bisa mengupload duplikat nama file asli.`,
        isDuplicate: true,
      });
    }
    // --- AKHIR PENGECEKAN DUPLIKAT ---

    //KODE untuk menyimpan dokumen ke database
    // Hitung hash SHA3 dari file yang diupload
    const sha3Hash = await calculateSHA3FromFile(filePath);

    const [result] = await db.query(
      "INSERT INTO documents (original_filename, stored_filename, sha3_256_hash, content_type, file_size_bytes) VALUES (?, ?, ?, ?, ?)",
      [originalname, stored_filename, sha3Hash, mimetype, size]
    );

    res.status(201).json({
      message: "Original document uploaded successfully.",
      document: {
        id: result.insertId,
        original_filename: originalname,
        stored_filename: stored_filename, // konsisten dengan nama kolom
        sha3_hash: sha3Hash,
        upload_timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error("Error uploading original document:", error);
    // Hapus file jika terjadi error (kecuali error duplikat, karena sudah dihapus)
    if (!error.isDuplicate) {
      // Jangan coba hapus lagi jika sudah dihapus karena duplikat
      try {
        await fs.unlink(filePath);
      } catch (unlinkErr) {
        // Abaikan error jika file sudah tidak ada atau tidak bisa dihapus
        if (unlinkErr.code !== "ENOENT") {
          console.error(
            "Error deleting file after failed upload (non-duplicate error):",
            unlinkErr
          );
        }
      }
    }
    // Tanggapi dengan error server jika bukan error duplikat yang sudah ditangani
    if (!res.headersSent) {
      // Periksa apakah respons sudah dikirim (misalnya oleh error 409)
      res.status(500).json({
        message: "Server error during upload process.",
        error: error.message,
      });
    }
  }
};

// Dapatkan daftar dokumen
exports.getDocuments = async (req, res) => {
  const requestedPage = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const searchTerm = req.query.search || "";

  let queryParams = [];
  let countQueryParams = [];
  let baseQuery = "FROM documents";
  let whereClause = "";

  if (searchTerm) {
    whereClause = "WHERE LOWER(original_filename) LIKE LOWER(?)";
    const likeTerm = `%${searchTerm}%`;
    queryParams.push(likeTerm);
    countQueryParams.push(likeTerm);
  }

  try {
    const countQuery = `SELECT COUNT(*) as total ${baseQuery} ${whereClause}`;
    const [[countResult]] = await db.query(countQuery, countQueryParams);
    const totalDocuments = countResult.total;
    const totalPages = Math.ceil(totalDocuments / limit) || 1; // Jika 0 dokumen, totalPages = 1 (untuk UI)

    // Tentukan halaman yang efektif (valid)
    let effectivePage = requestedPage;
    if (effectivePage < 1) {
      effectivePage = 1;
    }
    if (effectivePage > totalPages) {
      effectivePage = totalPages;
    }
    // Jika tidak ada dokumen sama sekali, halaman efektif tetap 1
    if (totalDocuments === 0) {
      effectivePage = 1;
    }

    const offset = (effectivePage - 1) * limit;
    const dataQuery = `SELECT id, original_filename, upload_timestamp ${baseQuery} ${whereClause} ORDER BY upload_timestamp DESC LIMIT ? OFFSET ?`;
    const finalDataParams = [...queryParams, limit, offset]; // Buat array parameter baru

    const [documents] = await db.query(dataQuery, finalDataParams);

    res.json({
      documents,
      currentPage: effectivePage, // Kembalikan halaman yang benar-benar digunakan
      totalPages,
      totalDocuments,
      limit,
    });
  } catch (error) {
    console.error("Error fetching documents:", error);
    res.status(500).json({
      message: "Server error fetching documents.",
      error: error.message,
    });
  }
};

exports.verifyDocument = async (req, res) => {
  console.log(
    `[${new Date().toISOString()}] verifyDocument: Proses dimulai untuk ID ${
      req.params.id
    }`
  );
  if (!req.file) {
    console.error(
      `[${new Date().toISOString()}] verifyDocument: ERROR - No file uploaded.`
    );
    return res
      .status(400)
      .json({ message: "No file uploaded for verification." });
  }
  const { id } = req.params;
  const uploadedFile = req.file;
  const uploadedFilePath = uploadedFile.path;
  console.log(
    `[${new Date().toISOString()}] verifyDocument: File diterima - ${
      uploadedFile.originalname
    }, path sementara: ${uploadedFilePath}`
  );

  let responseData = {};

  try {
    console.log(
      `[${new Date().toISOString()}] verifyDocument: Mengambil info dokumen asli ID ${id} dari DB.`
    );
    const [rows] = await db.query(
      "SELECT sha3_256_hash, stored_filename, content_type FROM documents WHERE id = ?",
      [id]
    );
    if (rows.length === 0) {
      console.warn(
        `[${new Date().toISOString()}] verifyDocument: WARNING - Dokumen asli ID ${id} tidak ditemukan.`
      );
      // Penting: Hapus file yang diupload jika dokumen asli tidak ditemukan
      try {
        await fs.unlink(uploadedFilePath);
        console.log(
          `[${new Date().toISOString()}] verifyDocument: File sementara ${uploadedFilePath} dihapus (dokumen asli tidak ada).`
        );
      } catch (e) {
        console.error(
          `[${new Date().toISOString()}] verifyDocument: Gagal hapus file sementara ${uploadedFilePath} (dokumen asli tidak ada):`,
          e
        );
      }
      return res.status(404).json({ message: "Original document not found." });
    }
    const originalDocInfo = rows[0];
    const originalHash = originalDocInfo.sha3_256_hash;
    const originalFilePath = path.join(
      UPLOAD_DIR,
      originalDocInfo.stored_filename
    );
    console.log(
      `[${new Date().toISOString()}] verifyDocument: Info dokumen asli ditemukan. Hash asli: ${originalHash}, Path asli: ${originalFilePath}`
    );

    console.log(
      `[${new Date().toISOString()}] verifyDocument: Menghitung hash SHA3 untuk file ${uploadedFilePath}.`
    );
    const currentHash = await calculateSHA3FromFile(uploadedFilePath);
    console.log(
      `[${new Date().toISOString()}] verifyDocument: Hash SHA3 file terupload: ${currentHash}.`
    );
    const isMatch = originalHash === currentHash;
    console.log(
      `[${new Date().toISOString()}] verifyDocument: Perbandingan hash - isMatch: ${isMatch}.`
    );

    responseData = {
      documentId: id,
      integrityCheck: isMatch ? "MATCH" : "MISMATCH",
      originalHash: originalHash,
      calculatedHash: currentHash,
      message: isMatch
        ? "Intergritas Terjaga."
        : "Document integrity check failed (modified).",
    };

    if (!isMatch) {
      console.log(
        `[${new Date().toISOString()}] verifyDocument: Integritas MISMATCH. Memulai proses kalkulasi kemiripan.`
      );
      let textOriginal = null;
      let textUploaded = null;
      try {
        console.log(
          `[${new Date().toISOString()}] verifyDocument: Mengekstrak teks dari dokumen asli: ${originalFilePath}`
        );
        textOriginal = await extractText(
          originalFilePath,
          originalDocInfo.content_type
        );
        console.log(
          `[${new Date().toISOString()}] verifyDocument: Mengekstrak teks dari dokumen terupload: ${uploadedFilePath}`
        );
        textUploaded = await extractText(
          uploadedFilePath,
          uploadedFile.mimetype
        );

        if (textOriginal !== null && textUploaded !== null) {
          console.log(
            `[${new Date().toISOString()}] verifyDocument: Ekstraksi teks berhasil. Menghitung kemiripan.`
          );
          const similarityPercentage = calculateSimilarity(
            textOriginal,
            textUploaded
          );
          responseData.similarityPercentage = similarityPercentage.toFixed(2);
          responseData.message += ` Similarity with original: ${similarityPercentage.toFixed(
            2
          )}%`;
          responseData.originalTextContent = textOriginal;
          responseData.uploadedTextContent = textUploaded;
          console.log(
            `[${new Date().toISOString()}] verifyDocument: Kemiripan dihitung: ${similarityPercentage.toFixed(
              2
            )}%`
          );
        } else {
          console.warn(
            `[${new Date().toISOString()}] verifyDocument: WARNING - Gagal ekstrak teks dari salah satu atau kedua dokumen.`
          );
          responseData.similarityWarning =
            "Could not perform similarity check (text extraction failed or unsupported format).";
          responseData.originalTextContent = textOriginal; // Kirim apa adanya (bisa null)
          responseData.uploadedTextContent = textUploaded; // Kirim apa adanya (bisa null)
        }
      } catch (nlpError) {
        console.error(
          `[${new Date().toISOString()}] verifyDocument: ERROR - Saat kalkulasi kemiripan/ekstraksi teks:`,
          nlpError
        );
        responseData.similarityError = `Failed to calculate similarity: ${nlpError.message}`;
        responseData.originalTextContent = textOriginal; // Kirim apa adanya (bisa null)
        responseData.uploadedTextContent = textUploaded; // Kirim apa adanya (bisa null)
      }
    }

    console.log(
      `[${new Date().toISOString()}] verifyDocument: Menghapus file sementara ${uploadedFilePath}.`
    );
    await fs.unlink(uploadedFilePath);
    console.log(
      `[${new Date().toISOString()}] verifyDocument: File sementara dihapus. Mengirim respons JSON.`
    );
    return res.json(responseData); // Pastikan ada 'return' di sini
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] verifyDocument: ERROR - Terjadi kesalahan besar di try-catch utama:`,
      error
    );
    try {
      if (
        uploadedFilePath &&
        (await fs.stat(uploadedFilePath).catch(() => false))
      ) {
        await fs.unlink(uploadedFilePath);
        console.log(
          `[${new Date().toISOString()}] verifyDocument: File sementara ${uploadedFilePath} berhasil dihapus setelah error besar.`
        );
      }
    } catch (unlinkErr) {
      if (unlinkErr.code !== "ENOENT") {
        console.error(
          `[${new Date().toISOString()}] verifyDocument: Gagal hapus file sementara ${uploadedFilePath} setelah error besar:`,
          unlinkErr
        );
      }
    }
    if (!res.headersSent) {
      // Cek jika header belum terkirim
      console.log(
        `[${new Date().toISOString()}] verifyDocument: Mengirim respons error 500.`
      );
      return res.status(500).json({
        message: "Server error during verification process.",
        error: error.message,
      });
    } else {
      console.warn(
        `[${new Date().toISOString()}] verifyDocument: Headers sudah terkirim, tidak bisa mengirim respons error 500 lagi.`
      );
    }
  }
};

exports.deleteDocument = async (req, res) => {
  const { id } = req.params;

  // 1. Dapatkan nama file yang disimpan dari DB
  let storedFilename;
  try {
    const [rows] = await db.query(
      "SELECT stored_filename FROM documents WHERE id = ?",
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Document not found." });
    }
    storedFilename = rows[0].stored_filename;
  } catch (dbError) {
    console.error(
      `Error fetching document filename for deletion (ID: ${id}):`,
      dbError
    );
    return res.status(500).json({
      message: "Database error fetching document info.",
      error: dbError.message,
    });
  }

  // 2. Hapus record dari database
  try {
    const [deleteResult] = await db.query(
      "DELETE FROM documents WHERE id = ?",
      [id]
    );
    if (deleteResult.affectedRows === 0) {
      // Seharusnya tidak terjadi jika langkah 1 berhasil, tapi sebagai pengaman
      return res.status(404).json({
        message: "Document found but could not be deleted from database.",
      });
    }

    // 3. Hapus file fisik dari server (setelah DB berhasil dihapus)
    if (storedFilename) {
      const filePath = path.join(UPLOAD_DIR, storedFilename);
      try {
        await fs.unlink(filePath);
        console.log(`Successfully deleted file: ${filePath}`);
      } catch (unlinkError) {
        // Log error jika file tidak ditemukan atau tidak bisa dihapus,
        // tapi tetap kembalikan sukses karena record DB sudah dihapus.
        if (unlinkError.code === "ENOENT") {
          console.warn(
            `File not found for deleted document (ID: ${id}): ${filePath}`
          );
        } else {
          console.error(
            `Error deleting file for document (ID: ${id}): ${filePath}`,
            unlinkError
          );
          // Mungkin ingin mengembalikan status berbeda atau pesan tambahan di sini
          // jika penghapusan file dianggap kritis.
        }
      }
    } else {
      console.warn(
        `No stored filename found for deleted document (ID: ${id}), skipping file deletion.`
      );
    }

    res.json({ message: `dokumen dengan ID ${id} Berhasil di hapus.` });
  } catch (error) {
    console.error(`Error deleting document (ID: ${id}):`, error);
    res.status(500).json({
      message: "Server error during document deletion.",
      error: error.message,
    });
  }
};

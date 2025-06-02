// backend/routes/documentRoutes.js
const express = require("express");
const router = express.Router();
const documentController = require("../controllers/documentController");
const upload = require("../middleware/uploadMiddleware");

// POST /api/documents/upload - Upload dokumen asli
router.post(
  "/upload",
  upload.single("document"),
  documentController.uploadOriginalDocument
);

// GET /api/documents - Dapatkan list dokumen
router.get("/", documentController.getDocuments);

// POST /api/documents/:id/verify - Verifikasi Dokumen
router.post(
  "/:id/verify",
  upload.single("fileToVerify"),
  documentController.verifyDocument
);

// DELETE /api/documents/:id - Hapus Dokumen
router.delete("/:id", documentController.deleteDocument);

module.exports = router;

// backend/middleware/uploadMiddleware.js
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const UPLOAD_DIR = "./uploads/";

// Pastikan direktori uploads ada
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    // Buat nama file unik untuk menghindari konflik
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

// Filter file (opsional, contoh hanya izinkan tipe tertentu)
// const fileFilter = (req, file, cb) => {
//   if (file.mimetype === 'application/pdf' || file.mimetype.startsWith('text/')) {
//     cb(null, true);
//   } else {
//     cb(new Error('File type not supported!'), false);
//   }
// };

const upload = multer({
  storage: storage,
  // fileFilter: fileFilter,
  limits: { fileSize: 1024 * 1024 * 50 }, // Batas ukuran file 50MB
});

module.exports = upload;

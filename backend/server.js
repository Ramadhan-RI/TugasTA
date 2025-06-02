// backend/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors"); // Untuk mengizinkan request dari frontend (beda origin)
const documentRoutes = require("./routes/documentRoutes");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors()); // Izinkan semua origin (sesuaikan untuk production)
app.use(express.json()); // Body parser untuk JSON
app.use(express.urlencoded({ extended: true })); // Body parser untuk form data

// Routes
app.use("/api/documents", documentRoutes);

// Simple route for testing
app.get("/", (req, res) => {
  res.send("SHA3 & NLP Integrity API is running!");
});

// Error Handling Middleware (Contoh sederhana)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send({ message: "Something broke!", error: err.message });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// backend/config/db.js
require("dotenv").config();
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "doc_integrity_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

pool
  .getConnection()
  .then((connection) => {
    console.log("MySQL Connected...");
    connection.release();
  })
  .catch((err) => {
    console.error("Error connecting to MySQL:", err.message);
    process.exit(1); // Keluar jika tidak bisa konek DB
  });

module.exports = pool;

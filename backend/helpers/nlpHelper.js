// backend/helpers/nlpHelper.js
const natural = require("natural");
const { WordTokenizer } = natural; // Mengimpor WordTokenizer dari pustaka natural
const tokenizer = new WordTokenizer(); // Membuat instance baru dari WordTokenizer

// Fungsi untuk menghitung kesamaan antara dua teks menggunakan Jaccard Similarity
function calculateSimilarity(text1, text2) {
  // Jika salah satu teks kosong, kembalikan 0 karena tidak bisa dibandingkan
  if (!text1 || !text2) {
    return 0;
  }

  // Tokenisasi kedua teks dan ubah menjadi huruf kecil
  const tokens1 = tokenizer.tokenize(text1.toLowerCase());
  const tokens2 = tokenizer.tokenize(text2.toLowerCase());

  // Jika salah satu dokumen tidak memiliki token setelah tokenisasi, kembalikan 0 untuk menghindari error
  if (tokens1.length === 0 || tokens2.length === 0) {
    return 0;
  }

  // Buat Set dari token untuk mendapatkan token unik dari masing-masing teks
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);

  // Hitung irisan (intersection) dari kedua set token
  // Ini adalah token-token yang sama yang muncul di kedua teks
  const intersection = new Set([...set1].filter((token) => set2.has(token)));

  // Hitung gabungan (union) dari kedua set token
  // Ini adalah semua token unik yang ada di salah satu atau kedua teks
  const union = new Set([...set1, ...set2]);

  // Jika ukuran gabungan adalah 0 (misalnya kedua teks benar-benar kosong atau hanya berisi spasi),
  // kembalikan 0 untuk menghindari pembagian dengan nol.
  // (Meskipun pemeriksaan panjang token di atas seharusnya sudah menangani ini)
  if (union.size === 0) {
    return 0;
  }

  // Hitung Jaccard Similarity: ukuran irisan / ukuran gabungan
  const similarity = intersection.size / union.size;

  // Kembalikan kesamaan dalam bentuk persentase (0-100)
  // Pastikan nilai berada di antara 0 dan 1 sebelum dikalikan 100
  return Math.max(0, Math.min(1, similarity)) * 100;
}

// Ekspor fungsi calculateSimilarity agar bisa digunakan di modul lain
module.exports = { calculateSimilarity };

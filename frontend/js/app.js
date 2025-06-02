const API_BASE_URL = "http://localhost:8080/api/documents";
const JsDiff = window.Diff;

// --- State Variables ---
let currentPage = 1;
let documentsLimit = 10;
let currentSearchTerm = "";
let totalPages = 1;
let totalDocuments = 0;
let _latestVerificationResult = null; // To store the latest verification result for PDF

// Similarity Elements (assuming they exist as per your existing code)
const similarityDetailsSection = document.getElementById(
  "similarity-details-section"
);
const similarityBar = document.getElementById("similarity-bar");
const similarityPercentageText = document.getElementById(
  "similarity-percentage-text"
);
const diffOriginalText = document.getElementById("diff-original-text");
const diffModifiedText = document.getElementById("diff-modified-text");

// --- Element References ---
const uploadForm = document.getElementById("upload-form");
const originalFileInput = document.getElementById("original-file-input");
const uploadStatus = document.getElementById("upload-status");
const documentsTableBody = document.querySelector("#documents-table tbody");
const refreshListBtn = document.getElementById("refresh-list-btn");
const listLoading = document.getElementById("list-loading");
const listError = document.getElementById("list-error");

const actionSection = document.getElementById("action-section");
const cancelActionBtn = document.getElementById("cancel-action-btn");

const verificationForm = document.getElementById("verification-form");
const verifyDocIdSpan = document.getElementById("verify-doc-id");
const verifyDocIdInput = document.getElementById("verify-doc-id-input");
const verifyFileInput = document.getElementById("verify-file-input");
const verificationResultDiv = document.getElementById("verification-result");
const printPdfBtn = document.getElementById("print-pdf-btn"); // Get the PDF button

const searchInput = document.getElementById("search-input");
const searchBtn = document.getElementById("search-btn");
const clearSearchBtn = document.getElementById("clear-search-btn");

const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const pageInfo = document.getElementById("page-info");
const totalDocsInfo = document.getElementById("total-docs-info");

// --- Functions ---

async function fetchDocuments() {
  listLoading.style.display = "block";
  listError.style.display = "none";
  documentsTableBody.innerHTML = "";
  const url = `${API_BASE_URL}?page=${currentPage}&limit=${documentsLimit}&search=${encodeURIComponent(
    currentSearchTerm
  )}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: `HTTP error! status: ${response.status}` }));
      throw new Error(
        errorData.message || `HTTP error! status: ${response.status}`
      );
    }
    const data = await response.json();
    currentPage = data.currentPage;
    totalPages = data.totalPages;
    totalDocuments = data.totalDocuments;
    displayDocuments(data.documents);
    updatePaginationControls();
  } catch (error) {
    console.error("Error fetching documents:", error);
    listError.textContent = `Gagal memuat daftar dokumen: ${error.message}`;
    listError.style.display = "block";
    documentsTableBody.innerHTML = `<tr><td colspan="5" class="error">Gagal memuat data.</td></tr>`;
    totalPages = 1;
    totalDocuments = 0;
    updatePaginationControls();
  } finally {
    listLoading.style.display = "none";
  }
}

function displayDocuments(documents) {
  documentsTableBody.innerHTML = "";
  if (!documents || documents.length === 0) {
    const message = currentSearchTerm
      ? "Tidak ada dokumen ditemukan untuk pencarian ini."
      : "Belum ada dokumen tersimpan.";
    documentsTableBody.innerHTML = `<tr><td colspan="5">${message}</td></tr>`;
    return;
  }
  documents.forEach((doc) => {
    const row = document.createElement("tr");
    row.innerHTML = `
          <td>${doc.id}</td>
          <td>${escapeHtml(doc.original_filename)}</td>
          <td>${new Date(doc.upload_timestamp).toLocaleString("id-ID")}</td>
          <td class="action-buttons">
              <button onclick="showVerificationForm(${doc.id}, '${escapeHtml(
      doc.original_filename
    )}')">Verifikasi</button> <button class="action-buttons-delete" onclick="confirmDeleteDocument(${
      doc.id
    }, '${escapeHtml(doc.original_filename)}')">Hapus</button>
          </td>
      `;
    documentsTableBody.appendChild(row);
  });
}

function updatePaginationControls() {
  if (totalDocuments === 0) {
    pageInfo.textContent = "Halaman 1 dari 1";
    totalDocsInfo.textContent = "(Total 0 Dokumen)";
  } else {
    pageInfo.textContent = `Halaman ${currentPage} dari ${totalPages}`;
    totalDocsInfo.textContent = `(Total ${totalDocuments} Dokumen)`;
  }
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;
}

uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const file = originalFileInput.files[0];
  if (!file) {
    showStatus("Pilih file terlebih dahulu!", true);
    return;
  }
  const formData = new FormData();
  formData.append("document", file);
  showStatus("Mengupload...", false);

  try {
    const response = await fetch(`${API_BASE_URL}/upload`, {
      method: "POST",
      body: formData,
    });
    const result = await response.json();

    if (!response.ok) {
      if (response.status === 409 && result.isDuplicate) {
        showStatus(`${result.message}`, true, true);
      } else {
        showStatus(
          `Upload Gagal: ${
            result.message || `Error server (${response.status})`
          }`,
          true,
          true
        );
      }
      return;
    }
    showStatus(`Upload sukses! ID: ${result.document.id}`, false);
    originalFileInput.value = "";
    currentPage = 1;
    currentSearchTerm = "";
    searchInput.value = "";
    fetchDocuments();
  } catch (error) {
    console.error("Upload error (catch):", error);
    showStatus(
      `Upload Gagal: ${error.message || "Terjadi kesalahan jaringan."}`,
      true,
      true
    );
  }
});

verificationForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const docId = verifyDocIdInput.value;
  const file = verifyFileInput.files[0];

  _latestVerificationResult = null; // Reset previous result
  printPdfBtn.style.display = "none"; // Hide PDF button initially
  similarityDetailsSection.style.display = "none";
  if (diffOriginalText) diffOriginalText.innerHTML = "";
  if (diffModifiedText) diffModifiedText.innerHTML = "";
  if (similarityPercentageText) similarityPercentageText.textContent = "0%";
  if (similarityBar) {
    similarityBar.style.width = "0%";
    similarityBar.style.backgroundColor = "#e9ecef";
  }

  if (!file) {
    setResult(verificationResultDiv, "Pilih file untuk diverifikasi!", true);
    return;
  }

  const formData = new FormData();
  formData.append("fileToVerify", file);
  setResult(verificationResultDiv, "Memverifikasi dokumen...", false, "info");

  try {
    const response = await fetch(`${API_BASE_URL}/${docId}/verify`, {
      method: "POST",
      body: formData,
    });

    let result;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
      result = await response.json();
    } else {
      const errorText = await response.text();
      console.error("Server did not respond with JSON:", errorText);
      throw new Error(
        `Server error (status ${response.status}). Respons bukan JSON.`
      );
    }

    if (!response.ok) {
      const errorMessage =
        result.message || `Error verifikasi (status ${response.status}).`;
      throw new Error(errorMessage);
    }

    _latestVerificationResult = result; // Store result for PDF generation
    // Add original filename to the result for PDF context if available
    _latestVerificationResult.originalFilename =
      verifyDocIdSpan.dataset.originalFilename || "Tidak diketahui";

    let integrityMsg = "";
    let integrityClass = "";
    if (result.integrityCheck === "MATCH") {
      integrityMsg = `<span class="match">SESUAI (MATCH)</span> - ${result.message}\nHash Asli: ${result.originalHash}\nHash Dicek: ${result.calculatedHash}`;
      integrityClass = "match";
      similarityDetailsSection.style.display = "none";
      printPdfBtn.style.display = "block"; // Show PDF button
    } else {
      integrityMsg = `<span class="mismatch">TIDAK SESUAI (MISMATCH)</span> - Integritas Gagal!\nHash Asli: ${result.originalHash}\nHash Dicek: ${result.calculatedHash}`;
      integrityClass = "mismatch";
      if (result.similarityPercentage !== undefined) {
        similarityDetailsSection.style.display = "block";
        updateSimilarityVisual(result.similarityPercentage);
        displayDiffResults(
          result.originalTextContent,
          result.uploadedTextContent
        );
      } else if (result.similarityWarning) {
        similarityDetailsSection.style.display = "block";
        updateSimilarityVisual("N/A");
        if (diffOriginalText)
          diffOriginalText.textContent = result.similarityWarning;
        if (diffModifiedText) diffModifiedText.textContent = "";
        integrityMsg += `\n<span class="warning">${result.similarityWarning}</span>`;
      } else if (result.similarityError) {
        similarityDetailsSection.style.display = "block";
        updateSimilarityVisual("N/A");
        if (diffOriginalText)
          diffOriginalText.textContent = result.similarityError;
        if (diffModifiedText) diffModifiedText.textContent = "";
        integrityMsg += `\n<span class="error">${result.similarityError}</span>`;
      } else {
        similarityDetailsSection.style.display = "none";
      }
      printPdfBtn.style.display = "block"; // Show PDF button
    }
    setResult(verificationResultDiv, integrityMsg, false, integrityClass);
    verifyFileInput.value = "";
  } catch (error) {
    console.error("Error dalam proses verifikasi (Frontend):", error);
    setResult(
      verificationResultDiv,
      `Error Verifikasi: ${error.message || "Terjadi kesalahan."}`,
      true
    );
    similarityDetailsSection.style.display = "none";
    printPdfBtn.style.display = "none"; // Hide on error
  }
});

function confirmDeleteDocument(id, filename) {
  const currentTime = new Date().toLocaleTimeString("id-ID");
  if (
    window.confirm(
      `(${currentTime}) Apakah Anda yakin ingin menghapus dokumen "${filename}" (ID: ${id})?\nTindakan ini tidak dapat dibatalkan.`
    )
  ) {
    deleteDocument(id);
  }
}

async function deleteDocument(id) {
  showStatus(`Menghapus dokumen ID: ${id}...`, false);
  try {
    const response = await fetch(`${API_BASE_URL}/${id}`, {
      method: "DELETE",
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(
        result.message || `Gagal menghapus. Status: ${response.status}`
      );
    }
    showStatus(result.message, false);
    fetchDocuments();
  } catch (error) {
    console.error(`Error deleting document ${id}:`, error);
    showStatus(
      `Gagal menghapus dokumen ID ${id}: ${error.message}`,
      true,
      true
    );
  }
}

function showStatus(message, isError = false, isPersistent = false) {
  const timestamp = `[${new Date().toLocaleTimeString("id-ID")}]`;
  uploadStatus.textContent = `${timestamp} ${message}`;
  uploadStatus.className = isError ? "error" : "success";
  if (window.statusTimeout) clearTimeout(window.statusTimeout);
  if (!isPersistent) {
    window.statusTimeout = setTimeout(() => {
      if (uploadStatus.textContent === `${timestamp} ${message}`) {
        uploadStatus.textContent = "";
        uploadStatus.className = "";
      }
    }, 5000);
  }
}

function setResult(element, message, isError = false, extraClass = "") {
  if (!element) {
    console.error("setResult: Target element is null for message:", message);
    return;
  }
  element.innerHTML = message.replace(/\n/g, "<br>");
  let className = "result-box";
  if (isError) className += " error";
  else if (extraClass === "info") className += " info-box";
  else if (extraClass) className += ` ${extraClass}`;
  element.className = className;
}

// Updated to accept original filename
function showVerificationForm(docId, originalFilename = "Tidak Diketahui") {
  verifyDocIdSpan.textContent = docId;
  verifyDocIdSpan.dataset.originalFilename = originalFilename; // Store filename
  verifyDocIdInput.value = docId;
  verifyFileInput.value = "";
  verificationResultDiv.innerHTML = "";
  verificationResultDiv.className = "result-box";
  verificationForm.style.display = "block";
  actionSection.style.display = "block";
  similarityDetailsSection.style.display = "none";
  printPdfBtn.style.display = "none"; // Hide PDF button when form is shown
  _latestVerificationResult = null; // Clear any old result
  actionSection.scrollIntoView({ behavior: "smooth" });
}

function updateSimilarityVisual(percentage) {
  const numericPercent = parseFloat(percentage);
  if (isNaN(numericPercent)) {
    if (similarityBar) similarityBar.style.width = "0%";
    if (similarityPercentageText) similarityPercentageText.textContent = "N/A";
    if (similarityBar) similarityBar.style.backgroundColor = "#e9ecef";
    return;
  }
  if (similarityBar) similarityBar.style.width = `${numericPercent}%`;
  if (similarityPercentageText)
    similarityPercentageText.textContent = `${numericPercent.toFixed(2)}%`;
  if (similarityBar) {
    if (numericPercent >= 99.99)
      similarityBar.style.backgroundColor = "#28a745";
    // Green (almost identical text-wise)
    else if (numericPercent >= 90)
      similarityBar.style.backgroundColor = "#fd7e14";
    else if (numericPercent >= 70)
      similarityBar.style.backgroundColor = "#ffc107";
    else if (numericPercent >= 50)
      similarityBar.style.backgroundColor = "#198754"; // Darker Green
    else similarityBar.style.backgroundColor = "#dc3545"; // Red for low similarity
  }
}

function displayDiffResults(originalText, modifiedText) {
  if (typeof Diff === "undefined") {
    console.error("JsDiff library is not loaded.");
    if (diffOriginalText)
      diffOriginalText.textContent = "Error: Pustaka Diff tidak termuat.";
    if (diffModifiedText) diffModifiedText.textContent = "";
    return;
  }
  if (!diffOriginalText || !diffModifiedText) return;

  if (originalText === null || modifiedText === null) {
    diffOriginalText.textContent =
      originalText === null
        ? "(Tidak bisa ekstrak teks dari dokumen asli)"
        : originalText;
    diffModifiedText.textContent =
      modifiedText === null
        ? "(Tidak bisa ekstrak teks dari dokumen diverifikasi)"
        : modifiedText;
    return;
  }

  const diff = Diff.diffWordsWithSpace(originalText, modifiedText);
  let originalHtml = "";
  let modifiedHtml = "";

  diff.forEach((part) => {
    const value = escapeHtml(part.value);
    if (part.added) modifiedHtml += `<span class="diff-added">${value}</span>`;
    else if (part.removed)
      originalHtml += `<span class="diff-removed">${value}</span>`;
    else {
      originalHtml += `<span class="diff-common">${value}</span>`;
      modifiedHtml += `<span class="diff-common">${value}</span>`;
    }
  });
  diffOriginalText.innerHTML = originalHtml;
  diffModifiedText.innerHTML = modifiedHtml;
}

function cancelAction() {
  verificationForm.style.display = "none";
  actionSection.style.display = "none";
  printPdfBtn.style.display = "none";
  _latestVerificationResult = null;
}

function escapeHtml(unsafe) {
  if (unsafe === null || typeof unsafe === "undefined") return "";
  return unsafe
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// --- PDF Generation Function ---
function generateVerificationPDF(data) {
  if (!data) {
    alert("Tidak ada data verifikasi untuk dicetak.");
    return;
  }
  const { jsPDF } = window.jspdf;
  if (!jsPDF) {
    alert("Pustaka jsPDF belum termuat. Tidak bisa mencetak PDF.");
    return;
  }
  const doc = new jsPDF();
  let yPos = 20;
  const lineSpacing = 7;
  const sectionSpacing = 10;
  const leftMargin = 14;
  const contentWidth = doc.internal.pageSize.getWidth() - leftMargin * 2;

  doc.setFontSize(18);
  doc.text(
    "Hasil Verifikasi Integritas Dokumen",
    doc.internal.pageSize.getWidth() / 2,
    yPos,
    { align: "center" }
  );
  yPos += sectionSpacing * 1.5;

  doc.setFontSize(12);
  doc.setFont(undefined, "bold");
  doc.text("Informasi Umum", leftMargin, yPos);
  yPos += lineSpacing;
  doc.setFont(undefined, "normal");
  doc.text(`ID Dokumen Asli: ${data.documentId}`, leftMargin, yPos);
  yPos += lineSpacing;
  doc.text(
    `Nama File Asli: ${escapeHtml(data.originalFilename || "Tidak diketahui")}`,
    leftMargin,
    yPos
  );
  yPos += lineSpacing;
  doc.text(
    `Tanggal Verifikasi: ${new Date().toLocaleString("id-ID", {
      dateStyle: "full",
      timeStyle: "long",
    })}`,
    leftMargin,
    yPos
  );
  yPos += sectionSpacing;

  doc.setFont(undefined, "bold");
  doc.text("Hasil Pemeriksaan Integritas", leftMargin, yPos);
  yPos += lineSpacing;
  doc.setFont(undefined, "normal");

  let statusText, statusColor;
  if (data.integrityCheck === "MATCH") {
    statusText = "Status: SESUAI (MATCH)";
    statusColor = [0, 100, 0]; // Dark Green
  } else {
    statusText = "Status: TIDAK SESUAI (MISMATCH)";
    statusColor = [200, 0, 0]; // Dark Red
  }
  doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
  doc.text(statusText, leftMargin, yPos);
  doc.setTextColor(0, 0, 0); // Reset color
  yPos += lineSpacing;

  // Main message from verification
  let baseMessage = data.message;
  if (
    data.integrityCheck === "MISMATCH" &&
    data.similarityPercentage !== undefined
  ) {
    baseMessage = data.message.split(" Similarity with original:")[0]; // Get only the integrity part
  }
  const messageLines = doc.splitTextToSize(
    `Pesan: ${baseMessage}`,
    contentWidth
  );
  doc.text(messageLines, leftMargin, yPos);
  yPos += messageLines.length * (lineSpacing * 0.8) + lineSpacing / 2;

  doc.text("Hash Asli (SHA3-256):", leftMargin, yPos);
  yPos += lineSpacing * 0.7;
  const originalHashLines = doc.splitTextToSize(
    data.originalHash,
    contentWidth
  );
  doc.setFont("courier", "normal");
  doc.text(originalHashLines, leftMargin, yPos);
  doc.setFont(undefined, "normal");
  yPos += originalHashLines.length * (lineSpacing * 0.7) + lineSpacing / 2;

  doc.text("Hash Dokumen Diverifikasi:", leftMargin, yPos);
  yPos += lineSpacing * 0.7;
  const calculatedHashLines = doc.splitTextToSize(
    data.calculatedHash,
    contentWidth
  );
  doc.setFont("courier", "normal");
  doc.text(calculatedHashLines, leftMargin, yPos);
  doc.setFont(undefined, "normal");
  yPos += calculatedHashLines.length * (lineSpacing * 0.7) + lineSpacing / 2;

  if (data.integrityCheck === "MISMATCH") {
    yPos += lineSpacing / 2;
    doc.setFont(undefined, "bold");
    doc.text("Analisis Kemiripan Teks", leftMargin, yPos);
    yPos += lineSpacing;
    doc.setFont(undefined, "normal");

    if (data.similarityPercentage !== undefined) {
      doc.text(
        `Persentase Kemiripan: ${data.similarityPercentage}%`,
        leftMargin,
        yPos
      );
      yPos += lineSpacing;
      const noteLines = doc.splitTextToSize(
        "Catatan: Detail perbedaan teks dan visualisasi kemiripan dapat dilihat pada antarmuka web.",
        contentWidth
      );
      doc.text(noteLines, leftMargin, yPos);
      yPos += noteLines.length * (lineSpacing * 0.7) + lineSpacing / 2;
      yPos += lineSpacing;
    } else if (data.similarityWarning) {
      const warningLines = doc.splitTextToSize(
        `Peringatan Kemiripan: ${data.similarityWarning}`,
        contentWidth
      );
      doc.setTextColor(255, 165, 0); // Orange
      doc.text(warningLines, leftMargin, yPos);
      doc.setTextColor(0, 0, 0);
      yPos += warningLines.length * (lineSpacing * 0.7) + lineSpacing / 2;
    } else if (data.similarityError) {
      const errorLines = doc.splitTextToSize(
        `Error Kemiripan: ${data.similarityError}`,
        contentWidth
      );
      doc.setTextColor(255, 0, 0); // Red
      doc.text(errorLines, leftMargin, yPos);
      doc.setTextColor(0, 0, 0);
      yPos += errorLines.length * (lineSpacing * 0.7) + lineSpacing / 2;
    }
  }

  // Footer on each page
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.setTextColor(100); // Light gray
    const footerText = `Laporan dihasilkan oleh Sistem Informasi Integritas Keaslian Data Dokumen | ${new Date().toLocaleDateString(
      "id-ID"
    )}`;
    doc.text(footerText, leftMargin, doc.internal.pageSize.height - 15); // Adjusted spacing
    doc.text(
      "Halaman " + String(i) + " dari " + String(pageCount),
      doc.internal.pageSize.width - leftMargin - 20,
      doc.internal.pageSize.height - 10,
      { align: "right" }
    );
  }

  doc.save(`Laporan_Verifikasi_Dokumen_ID_${data.documentId}.pdf`);
}

// --- Event Listeners ---
refreshListBtn.addEventListener("click", () => {
  currentSearchTerm = "";
  searchInput.value = "";
  currentPage = 1;
  fetchDocuments();
});

cancelActionBtn.addEventListener("click", cancelAction);

searchBtn.addEventListener("click", () => {
  currentSearchTerm = searchInput.value.trim();
  currentPage = 1;
  fetchDocuments();
});

searchInput.addEventListener("keyup", (event) => {
  if (event.key === "Enter") {
    currentSearchTerm = searchInput.value.trim();
    currentPage = 1;
    fetchDocuments();
  }
});

clearSearchBtn.addEventListener("click", () => {
  if (currentSearchTerm !== "") {
    currentSearchTerm = "";
    searchInput.value = "";
    currentPage = 1;
    fetchDocuments();
  }
});

prevBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    fetchDocuments();
  }
});

nextBtn.addEventListener("click", () => {
  if (currentPage < totalPages) {
    currentPage++;
    fetchDocuments();
  }
});

printPdfBtn.addEventListener("click", () => {
  if (_latestVerificationResult) {
    generateVerificationPDF(_latestVerificationResult);
  } else {
    alert("Tidak ada hasil verifikasi terbaru untuk dicetak.");
  }
});

document.addEventListener("DOMContentLoaded", () => {
  if (typeof Diff === "undefined") {
    console.warn("JsDiff library not immediately available.");
  }
  if (typeof window.jspdf === "undefined") {
    console.warn("jsPDF library not immediately available.");
  }
  fetchDocuments();
});

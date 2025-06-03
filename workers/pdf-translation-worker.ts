// Download the PDF file
const pdfPath = path.join(workerPdfsDir, `${jobId}-${filename}`)
console.log(`⬇️ Downloading from ${pdfUrl} to ${pdfPath}...`)

try {
  const response = await fetch(pdfUrl)
  if (!response.ok) throw new Error(`Failed to download PDF: ${response.statusText}`)
  
  const arrayBuffer = await response.arrayBuffer()
  const uint8Array = new Uint8Array(arrayBuffer)
  await fs.writeFile(pdfPath, uint8Array)
  console.log(`✅ Downloaded to ${pdfPath}`)
} catch (error) {
  console.error('❌ Download failed:', error)
  throw error
}

// Process the PDF
try {
  // Load the PDF file
  const pdfData = await fs.readFile(pdfPath)
  const uint8Array = new Uint8Array(pdfData)
  const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise

  // ... existing code ...
} catch (error) {
  console.error('❌ PDF processing failed:', error)
  throw error
} 
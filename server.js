const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Parser } = require('json2csv');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configurazione Upload Copertine
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// API Upload Immagine
app.post('/api/upload', upload.single('cover'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nessun file caricato' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// API Export CSV
app.post('/api/export/csv', (req, res) => {
  try {
    const books = req.body.books || [];
    const fields = ['titolo', 'autore', 'anno', 'serie', 'edizione', 'formato', 'pagine', 'dataFine'];
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(books);

    res.header('Content-Type', 'text/csv');
    res.attachment('libri_letti.csv');
    return res.send(csv);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// API Export PDF
app.post('/api/export/pdf', (req, res) => {
  try {
    const books = req.body.books || [];
    const doc = new PDFDocument({ margin: 30, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=libri_letti.pdf');

    doc.pipe(res);

    doc.fontSize(18).text('Riepilogo Libri Letti', { align: 'center' });
    doc.moveDown();

    books.forEach((b, index) => {
      doc.fontSize(12).text(`${index + 1}. ${b.titolo} - ${b.autore}`);
      doc.fontSize(10).fillColor('#666666').text(`Formato: ${b.formato} | Pagine: ${b.pagine || 'N/D'} | Finito il: ${b.dataFine || 'N/D'} | Serie/Argomento: ${b.serie || '-'}`);
      doc.fillColor('#000000').moveDown(0.5);
    });

    doc.end();
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Server attivo su http://localhost:${PORT}`);
});
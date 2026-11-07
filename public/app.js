// ============================================================
// Tracker Book - app.js (versione corretta)
// ============================================================

const PLACEHOLDER_COVER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="65" height="95">' +
    '<rect width="100%" height="100%" fill="#ddd"/>' +
    '<text x="50%" y="50%" font-size="12" text-anchor="middle" fill="#888" ' +
    'font-family="sans-serif">Libro</text></svg>'
  );

// Caricamento sicuro da localStorage (non crasha se i dati sono rovinati)
function loadBooks() {
  try {
    const raw = localStorage.getItem('tb_books');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Errore lettura localStorage:', err);
    return [];
  }
}

let books = loadBooks();
let editingId = null;
let currentOverviewTab = 'authors';
let currentCoverBase64 = '';

document.addEventListener('DOMContentLoaded', () => {
  renderHome();
  renderYearsCards();
  updateDatalists();
});

// Registrazione Service Worker Offline
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW error:', err));
  });
}

// ------------------------------------------------------------
// Utilità
// ------------------------------------------------------------
function escapeHTML(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Per valori dentro onclick="...('...')": evita che apostrofi rompano l'HTML
function encodeArg(str) {
  return encodeURIComponent(String(str)).replace(/'/g, '%27');
}

function dateValue(d) {
  const t = d ? new Date(d).getTime() : 0;
  return isNaN(t) ? 0 : t;
}

// Salva e restituisce true/false (localStorage può essere pieno)
function saveToStorage() {
  try {
    localStorage.setItem('tb_books', JSON.stringify(books));
  } catch (err) {
    console.error('Errore salvataggio localStorage:', err);
    alert('Impossibile salvare i dati nel browser (' + err.name + '). ' +
          'La memoria potrebbe essere piena: prova a usare copertine più piccole.');
    return false;
  }
  updateDatalists();
  return true;
}

// ------------------------------------------------------------
// Navigazione
// ------------------------------------------------------------
function switchTab(tabId, title, iconSymbol, btnElement) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'));

  document.getElementById(`sec-${tabId}`).classList.add('active');
  document.getElementById('page-title').innerText = title;
  document.getElementById('header-icon').innerText = iconSymbol;

  if (btnElement) btnElement.classList.add('active');

  if (tabId === 'home') renderHome();
  if (tabId === 'libri') renderYearsCards();
  if (tabId === 'panoramica') switchOverviewTab(currentOverviewTab);
}

function setFormat(fmt) {
  document.getElementById('inp-format').value = fmt;
  document.getElementById('btn-cartaceo').classList.toggle('active', fmt === 'Cartaceo');
  document.getElementById('btn-ebook').classList.toggle('active', fmt === 'Ebook');
}

function toggleForm() {
  const form = document.getElementById('book-form');
  form.classList.toggle('hidden');
  if (form.classList.contains('hidden')) {
    form.reset();
    editingId = null;
    currentCoverBase64 = '';
    document.getElementById('form-title').innerText = 'Nuovo Libro';
    document.getElementById('cover-preview-container').classList.add('hidden');
  }
}

// ------------------------------------------------------------
// Copertina: anteprima + compressione (più leggera per non
// riempire il localStorage)
// ------------------------------------------------------------
function previewThumbnail(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const MAX_WIDTH = 220;
      const MAX_HEIGHT = 330;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
      } else {
        if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
      }

      canvas.width = Math.round(width);
      canvas.height = Math.round(height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      currentCoverBase64 = canvas.toDataURL('image/jpeg', 0.7);
      document.getElementById('cover-preview').src = currentCoverBase64;
      document.getElementById('cover-preview-container').classList.remove('hidden');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ------------------------------------------------------------
// Salvataggio libro
// ------------------------------------------------------------
document.getElementById('book-form').addEventListener('submit', (e) => {
  e.preventDefault();

  let coverToSave = currentCoverBase64;
  if (!coverToSave && editingId !== null) {
    const existingBook = books.find(b => b.id == editingId);
    if (existingBook) coverToSave = existingBook.copertina;
  }

  const bookData = {
    id: editingId !== null ? editingId : Date.now(),
    titolo: document.getElementById('inp-title').value,
    autore: document.getElementById('inp-author').value,
    pagine: Math.round(parseFloat(document.getElementById('inp-pages').value) || 0),
    anno: document.getElementById('inp-year').value,
    serie: document.getElementById('inp-serie').value,
    edizione: document.getElementById('inp-edition').value,
    formato: document.getElementById('inp-format').value,
    dataFine: document.getElementById('inp-date-end').value,
    copertina: coverToSave || PLACEHOLDER_COVER
  };

  const previous = books.slice();

  if (editingId !== null) {
    const index = books.findIndex(b => b.id == editingId);
    if (index !== -1) books[index] = bookData;
    else books.push(bookData);
  } else {
    books.push(bookData);
  }

  if (!saveToStorage()) {
    books = previous; // annulla se il salvataggio è fallito
    return;
  }

  toggleForm();
  renderHome();
  renderYearsCards();
});

// ------------------------------------------------------------
// HOME
// ------------------------------------------------------------
function renderHome() {
  const currentYear = new Date().getFullYear().toString();

  let totalPages = 0, totalCartaceo = 0, totalEbook = 0;
  let yearBooks = 0, yearCartaceo = 0, yearEbook = 0, yearPages = 0;

  books.forEach(b => {
    const pages = Math.round(parseFloat(b.pagine) || 0);
    totalPages += pages;
    if (b.formato === 'Cartaceo') totalCartaceo++;
    if (b.formato === 'Ebook') totalEbook++;

    if (b.dataFine && String(b.dataFine).startsWith(currentYear)) {
      yearBooks++;
      yearPages += pages;
      if (b.formato === 'Cartaceo') yearCartaceo++;
      if (b.formato === 'Ebook') yearEbook++;
    }
  });

  document.getElementById('stat-total-books').innerHTML = `${books.length} <span class="unit">libri</span>`;
  document.getElementById('stat-total-pages').innerText = `${totalPages.toLocaleString()} pagine lette`;
  document.getElementById('stat-total-cartaceo').innerText = `📖 ${totalCartaceo} cartacei`;
  document.getElementById('stat-total-ebook').innerText = `📱 ${totalEbook} ebook`;

  document.getElementById('stat-year-books').innerHTML = `${yearBooks} <span class="unit">libri</span>`;
  document.getElementById('stat-year-pages').innerText = `${yearPages.toLocaleString()} pagine quest'anno`;
  document.getElementById('stat-year-cartaceo').innerText = `📖 ${yearCartaceo} cartacei`;
  document.getElementById('stat-year-ebook').innerText = `📱 ${yearEbook} ebook`;

  const currentYearBooks = books
    .filter(b => b.dataFine && String(b.dataFine).startsWith(currentYear))
    .sort((a, b) => dateValue(b.dataFine) - dateValue(a.dataFine));

  document.getElementById('home-book-list').innerHTML =
    currentYearBooks.map(b => renderBookCardHTML(b)).join('');
}

// ------------------------------------------------------------
// ANNI
// ------------------------------------------------------------
function renderYearsCards() {
  const container = document.getElementById('years-cards-container');
  const yearsMap = {};

  books.forEach(b => {
    const y = b.dataFine ? String(b.dataFine).split('-')[0] : 'Senza Data';
    if (!yearsMap[y]) yearsMap[y] = { cartaceo: 0, ebook: 0, count: 0, pages: 0 };
    yearsMap[y].count++;
    yearsMap[y].pages += Math.round(parseFloat(b.pagine) || 0);
    if (b.formato === 'Cartaceo') yearsMap[y].cartaceo++;
    if (b.formato === 'Ebook') yearsMap[y].ebook++;
  });

  const years = Object.keys(yearsMap).sort((a, b) => {
    if (a === 'Senza Data') return 1;
    if (b === 'Senza Data') return -1;
    return b - a;
  });

  container.innerHTML = years.map(y => `
    <div class="shelf-tile" onclick="openYearDetails('${encodeArg(y)}')">
      <div class="tile-title">${escapeHTML(y)}</div>
      <div class="tile-count">${yearsMap[y].count} libri (${yearsMap[y].pages.toLocaleString()} pag.)</div>
      <div class="stat-breakdown-row" style="margin-top:12px; font-size:14px;">
        <span>📖 ${yearsMap[y].cartaceo}</span>
        <span>•</span>
        <span>📱 ${yearsMap[y].ebook}</span>
      </div>
    </div>
  `).join('');
}

function openYearDetails(encodedYear) {
  const year = decodeURIComponent(encodedYear);
  document.getElementById('years-cards-container').classList.add('hidden');
  document.getElementById('year-details').classList.remove('hidden');
  document.getElementById('selected-year-title').innerText = `Scaffale Anno ${year}`;

  const filtered = books
    .filter(b => (b.dataFine ? String(b.dataFine).startsWith(year) : year === 'Senza Data'))
    .sort((a, b) => dateValue(a.dataFine) - dateValue(b.dataFine));

  document.getElementById('year-book-list').innerHTML =
    filtered.map(b => renderBookCardHTML(b, true)).join('');
}

function closeYearDetails() {
  document.getElementById('year-details').classList.add('hidden');
  document.getElementById('years-cards-container').classList.remove('hidden');
}

// ------------------------------------------------------------
// PANORAMICA
// ------------------------------------------------------------
function formatKey(b) {
  if (b.formato === 'Cartaceo') return '📖 Cartaceo';
  if (b.formato === 'Ebook') return '📱 Ebook';
  return b.formato || 'Altro';
}

function switchOverviewTab(type) {
  currentOverviewTab = type;

  document.getElementById('btn-ov-authors').classList.toggle('active', type === 'authors');
  document.getElementById('btn-ov-series').classList.toggle('active', type === 'series');
  document.getElementById('btn-ov-formats').classList.toggle('active', type === 'formats');

  closeOverviewDetail();

  const grid = document.getElementById('overview-grid');
  const groups = {};

  books.forEach(b => {
    let key = '';
    if (type === 'authors') key = (b.autore || '').trim();
    if (type === 'series') key = b.serie ? b.serie.trim() : '';
    if (type === 'formats') key = formatKey(b);

    if (key) {
      if (!groups[key]) groups[key] = [];
      groups[key].push(b);
    }
  });

  const keys = Object.keys(groups).sort((a, b) =>
    a.localeCompare(b, 'it', { sensitivity: 'base' })
  );

  grid.innerHTML = keys.map(k => `
    <div class="shelf-tile" onclick="openOverviewDetail('${type}', '${encodeArg(k)}')">
      <div class="tile-title">${escapeHTML(k)}</div>
      <div class="tile-count">${groups[k].length} libri letti</div>
    </div>
  `).join('');
}

function openOverviewDetail(type, encodedKey) {
  const key = decodeURIComponent(encodedKey);
  document.getElementById('overview-grid').classList.add('hidden');
  document.getElementById('overview-detail').classList.remove('hidden');
  document.getElementById('overview-detail-title').innerText = key;

  const filtered = books.filter(b => {
    if (type === 'authors') return (b.autore || '').trim() === key;
    if (type === 'series') return (b.serie ? b.serie.trim() : '') === key;
    if (type === 'formats') return formatKey(b) === key;
    return false;
  }).sort((a, b) => dateValue(a.dataFine) - dateValue(b.dataFine));

  document.getElementById('overview-detail-list').innerHTML =
    filtered.map(b => renderBookCardHTML(b, true)).join('');
}

function closeOverviewDetail() {
  document.getElementById('overview-detail').classList.add('hidden');
  document.getElementById('overview-grid').classList.remove('hidden');
}

// ------------------------------------------------------------
// Scheda libro
// ------------------------------------------------------------
function renderBookCardHTML(b, showActions = false) {
  let formattedDate = 'N/D';
  if (b.dataFine) {
    const dateObj = new Date(b.dataFine);
    if (!isNaN(dateObj)) {
      formattedDate = dateObj.toLocaleDateString('it-IT', {
        day: 'numeric', month: 'long', year: 'numeric'
      });
    }
  }

  const cover = b.copertina ? escapeHTML(b.copertina) : escapeHTML(PLACEHOLDER_COVER);
  const idArg = encodeArg(b.id);

  return `
    <div class="book-card">
      <img src="${cover}" class="book-cover" alt="copertina">
      <div class="book-info">
        <h4>${escapeHTML(b.titolo)}</h4>
        <p><strong>Autore:</strong> ${escapeHTML(b.autore)}</p>
        <p><strong>Anno:</strong> ${escapeHTML(b.anno || 'N/D')} &nbsp;|&nbsp; <strong>Serie / Tag:</strong> ${escapeHTML(b.serie || '-')}</p>
        <p><strong>Pagine:</strong> ${Math.round(parseFloat(b.pagine) || 0)} &nbsp;|&nbsp; <strong>Formato:</strong> ${escapeHTML(b.formato)}</p>
        <p><strong>Terminato il:</strong> ${escapeHTML(formattedDate)}</p>
        ${showActions ? `
          <div class="action-buttons">
            <button class="action-btn btn-edit" onclick="editBook('${idArg}')">Modifica</button>
            <button class="action-btn btn-delete" onclick="deleteBook('${idArg}')">Elimina</button>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

// ------------------------------------------------------------
// Modifica / Elimina
// ------------------------------------------------------------
function editBook(id) {
  const bookToEdit = books.find(item => item.id == decodeURIComponent(id));
  if (!bookToEdit) return;

  editingId = bookToEdit.id;

  document.getElementById('inp-title').value = bookToEdit.titolo || '';
  document.getElementById('inp-author').value = bookToEdit.autore || '';
  document.getElementById('inp-pages').value = bookToEdit.pagine || '';
  document.getElementById('inp-year').value = bookToEdit.anno || '';
  document.getElementById('inp-serie').value = bookToEdit.serie || '';
  document.getElementById('inp-edition').value = bookToEdit.edizione || '';
  document.getElementById('inp-date-end').value = bookToEdit.dataFine || '';
  currentCoverBase64 = bookToEdit.copertina || '';

  if (bookToEdit.copertina && bookToEdit.copertina.startsWith('data:image')) {
    document.getElementById('cover-preview').src = bookToEdit.copertina;
    document.getElementById('cover-preview-container').classList.remove('hidden');
  } else {
    document.getElementById('cover-preview-container').classList.add('hidden');
  }

  setFormat(bookToEdit.formato);
  document.getElementById('form-title').innerText = 'Modifica Libro';

  closeYearDetails();
  closeOverviewDetail();

  switchTab('libri', 'Libreria', '📚', document.querySelectorAll('.tab-item')[1]);
  document.getElementById('book-form').classList.remove('hidden');

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteBook(id) {
  const realId = decodeURIComponent(id);
  if (confirm('Vuoi rimuovere questo libro dalla libreria?')) {
    const previous = books.slice();
    books = books.filter(item => item.id != realId);
    if (!saveToStorage()) {
      books = previous;
      return;
    }
    renderHome();
    renderYearsCards();
    if (!document.getElementById('year-details').classList.contains('hidden')) {
      closeYearDetails();
    }
    if (!document.getElementById('overview-detail').classList.contains('hidden')) {
      closeOverviewDetail();
    }
  }
}

function updateDatalists() {
  const authors = [...new Set(books.map(b => b.autore).filter(Boolean))];
  const series = [...new Set(books.map(b => b.serie).filter(Boolean))];

  const la = document.getElementById('list-authors');
  const ls = document.getElementById('list-series');
  if (la) la.innerHTML = authors.map(a => `<option value="${escapeHTML(a)}">`).join('');
  if (ls) ls.innerHTML = series.map(s => `<option value="${escapeHTML(s)}">`).join('');
}

// ------------------------------------------------------------
// Export (CSV / altri formati via API)
// ------------------------------------------------------------
async function exportData(type) {
  try {
    const res = await fetch(`/api/export/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ books })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `libri_letti.${type}`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 100);
  } catch (err) {
    console.error('Errore export:', err);
    alert('Esportazione non riuscita: ' + err.message);
  }
}

// ------------------------------------------------------------
// Backup JSON
// ------------------------------------------------------------
function backupJSON() {
  const dataStr = JSON.stringify(books, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'backup_tracker_book.json';
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 100);
}

// ------------------------------------------------------------
// Ripristino JSON: errori separati e messaggi reali
// ------------------------------------------------------------
function restoreJSON(event) {
  const input = event.target;
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onerror = function () {
    alert('Impossibile leggere il file selezionato.');
    input.value = '';
  };

  reader.onload = function (e) {
    // 1) Parsing del file
    let parsed;
    try {
      parsed = JSON.parse(e.target.result);
    } catch (err) {
      console.error('JSON non valido:', err);
      alert('Il file non è un JSON valido: ' + err.message);
      input.value = '';
      return;
    }

    // Accetta sia [..] sia { books: [..] }
    if (!Array.isArray(parsed) && parsed && Array.isArray(parsed.books)) {
      parsed = parsed.books;
    }
    if (!Array.isArray(parsed)) {
      alert('Formato non riconosciuto: mi aspettavo una lista di libri.');
      input.value = '';
      return;
    }

    // 2) Normalizzazione dei record
    const cleaned = parsed
      .filter(b => b && typeof b === 'object' && b.titolo)
      .map((b, i) => ({
        id: b.id || Date.now() + i,
        titolo: String(b.titolo || ''),
        autore: String(b.autore || ''),
        pagine: Math.round(parseFloat(b.pagine) || 0),
        anno: String(b.anno || ''),
        serie: String(b.serie || ''),
        edizione: String(b.edizione || ''),
        formato: b.formato === 'Ebook' ? 'Ebook' : 'Cartaceo',
        dataFine: String(b.dataFine || ''),
        copertina: b.copertina || PLACEHOLDER_COVER
      }));

    if (cleaned.length === 0) {
      alert('Il file non contiene libri validi.');
      input.value = '';
      return;
    }

    // 3) Salvataggio (se fallisce, ripristina lo stato precedente)
    const previous = books;
    books = cleaned;
    if (!saveToStorage()) {
      books = previous;
      input.value = '';
      return;
    }

    // 4) Aggiornamento interfaccia (errore separato)
    try {
      renderHome();
      renderYearsCards();
      closeYearDetails();
      closeOverviewDetail();
    } catch (err) {
      console.error('Errore rendering:', err);
    }

    alert('Ripristino completato: ' + cleaned.length + ' libri.');
    input.value = '';
  };

  reader.readAsText(file, 'UTF-8');
}

// ------------------------------------------------------------
// Cancella tutto
// ------------------------------------------------------------
function clearAllData() {
  if (confirm('Attenzione: questa azione eliminerà tutti i libri salvati. Vuoi procedere?')) {
    books = [];
    if (!saveToStorage()) return;
    renderHome();
    renderYearsCards();
    closeYearDetails();
    closeOverviewDetail();
    switchOverviewTab(currentOverviewTab);
    alert('Tutti i dati sono stati cancellati.');
  }
}
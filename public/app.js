// ============================================================
// Tracker Book - app.js (versione IndexedDB + Timeline Grafica)
// ============================================================

const PLACEHOLDER_COVER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="65" height="95">' +
    '<rect width="100%" height="100%" fill="#ddd"/>' +
    '<text x="50%" y="50%" font-size="12" text-anchor="middle" fill="#888" ' +
    'font-family="sans-serif">Libro</text></svg>'
  );

// Lista libri tenuta in memoria per il rendering; la fonte
// permanente dei dati è IndexedDB.
let books = [];
let editingId = null;
let currentOverviewTab = 'authors';
let currentCoverBase64 = '';

// ------------------------------------------------------------
// IndexedDB
// ------------------------------------------------------------
const DB_NAME = 'tracker_book_db';
const DB_VERSION = 1;
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB non supportato da questo browser'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Apertura database bloccata: chiudi le altre schede dell\'app'));
  });
  return dbPromise;
}

const STORE = 'books';

// Esegue una transazione e attende il completamento reale
async function runTx(mode, work) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    try {
      work(store);
    } catch (err) {
      reject(err);
      try { tx.abort(); } catch (_) {}
      return;
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transazione annullata'));
  });
}

async function idbGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(book) {
  return runTx('readwrite', store => { store.put(book); });
}

function idbDelete(id) {
  return runTx('readwrite', store => { store.delete(id); });
}

function idbReplaceAll(list) {
  return runTx('readwrite', store => {
    store.clear();
    list.forEach(b => store.put(b));
  });
}

function idbClear() {
  return runTx('readwrite', store => { store.clear(); });
}

function showStorageError(err) {
  console.error('Errore archiviazione:', err);
  alert('Errore nel salvataggio dei dati (' + (err && err.name ? err.name : 'errore') +
        '): ' + (err && err.message ? err.message : err));
}

// ------------------------------------------------------------
// Normalizzazione di un record libro
// ------------------------------------------------------------
function normalizeBook(b, i) {
  let id = Number(b.id);
  if (!isFinite(id) || id <= 0) id = Date.now() + i;
  return {
    id: id,
    titolo: String(b.titolo || ''),
    autore: String(b.autore || ''),
    pagine: Math.round(parseFloat(b.pagine) || 0),
    anno: String(b.anno || ''),
    serie: String(b.serie || ''),
    edizione: String(b.edizione || ''),
    formato: b.formato === 'Ebook' ? 'Ebook' : 'Cartaceo',
    dataFine: String(b.dataFine || ''),
    copertina: b.copertina || PLACEHOLDER_COVER
  };
}

function normalizeList(list) {
  const seen = new Set();
  const out = [];
  list
    .filter(b => b && typeof b === 'object' && b.titolo)
    .forEach((b, i) => {
      const nb = normalizeBook(b, i);
      while (seen.has(nb.id)) nb.id++;
      seen.add(nb.id);
      out.push(nb);
    });
  return out;
}

// ------------------------------------------------------------
// Avvio: apre il DB, migra i vecchi dati da localStorage, disegna UI
// ------------------------------------------------------------
async function initApp() {
  try {
    await openDB();
    books = await idbGetAll();

    const raw = localStorage.getItem('tb_books');
    if (raw && books.length === 0) {
      try {
        const old = JSON.parse(raw);
        if (Array.isArray(old) && old.length > 0) {
          const cleaned = normalizeList(old);
          await idbReplaceAll(cleaned);
          const check = await idbGetAll();
          if (check.length === cleaned.length) {
            books = check;
            localStorage.removeItem('tb_books');
            console.log('Migrazione completata:', check.length, 'libri');
          }
        }
      } catch (err) {
        console.error('Migrazione fallita:', err);
      }
    }

    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
  } catch (err) {
    showStorageError(err);
  }

  renderHome();
  renderYearsCards();
  updateDatalists();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

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

function encodeArg(str) {
  return encodeURIComponent(String(str)).replace(/'/g, '%27');
}

function dateValue(d) {
  const t = d ? new Date(d).getTime() : 0;
  return isNaN(t) ? 0 : t;
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
// Copertina
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
      const MAX_WIDTH = 160;
      const MAX_HEIGHT = 240;

      const scale = Math.min(MAX_WIDTH / img.width, MAX_HEIGHT / img.height, 1);
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      currentCoverBase64 = canvas.toDataURL('image/jpeg', 0.72);
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
document.getElementById('book-form').addEventListener('submit', async (e) => {
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

  try {
    await idbPut(bookData);
  } catch (err) {
    showStorageError(err);
    return;
  }

  const index = books.findIndex(b => b.id == bookData.id);
  if (index !== -1) books[index] = bookData;
  else books.push(bookData);

  updateDatalists();
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
// ANNI (Con Timeline Grafica Integrata)
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

  if (years.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">Nessun libro disponibile.</p>';
    return;
  }

  // Calcolo dei massimi per proporzionare le altezze delle barre
  let maxBooks = 1;
  let maxPages = 1;
  years.forEach(y => {
    if (yearsMap[y].count > maxBooks) maxBooks = yearsMap[y].count;
    if (yearsMap[y].pages > maxPages) maxPages = yearsMap[y].pages;
  });

  // Generazione HTML della Timeline Grafica
  const timelineHTML = `
    <div class="timeline-container" style="background: var(--card-bg, #ffffff); border-radius: 12px; padding: 16px; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      <div class="timeline-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-weight: bold; font-size: 15px;">
        <span>Andamento per Anno</span>
        <div class="timeline-legend" style="display: flex; gap: 15px; font-size: 13px;">
          <div class="legend-item" style="display: flex; align-items: center; gap: 5px;"><span class="legend-dot" style="width: 10px; height: 10px; border-radius: 3px; background-color: #3b82f6;"></span> Libri</div>
          <div class="legend-item" style="display: flex; align-items: center; gap: 5px;"><span class="legend-dot" style="width: 10px; height: 10px; border-radius: 3px; background-color: #10b981;"></span> Pagine</div>
        </div>
      </div>
      <div class="timeline-bars-wrapper" style="display: flex; align-items: flex-end; gap: 12px; height: 160px; overflow-x: auto; padding-bottom: 10px; border-bottom: 2px solid #e5e7eb;">
        ${years.map(y => {
          const data = yearsMap[y];
          const booksHeight = Math.max(8, Math.round((data.count / maxBooks) * 100));
          const pagesHeight = Math.max(8, Math.round((data.pages / maxPages) * 100));

          return `
            <div class="timeline-year-group" onclick="openYearDetails('${encodeArg(y)}')" style="display: flex; flex-direction: column; align-items: center; flex: 1; min-width: 50px; height: 100%; justify-content: flex-end; cursor: pointer;" title="${y}: ${data.count} libri, ${data.pages} pagine">
              <div class="timeline-bars-pair" style="display: flex; align-items: flex-end; gap: 4px; height: 120px; width: 100%; justify-content: center;">
                <div class="timeline-bar bar-books" style="width: 14px; background-color: #3b82f6; border-radius: 4px 4px 0 0; height: ${booksHeight}px;" title="${data.count} libri"></div>
                <div class="timeline-bar bar-pages" style="width: 14px; background-color: #10b981; border-radius: 4px 4px 0 0; height: ${pagesHeight}px;" title="${data.pages} pagine"></div>
              </div>
              <div class="timeline-year-label" style="margin-top: 8px; font-size: 12px; color: #6b7280; font-weight: 600; text-align: center;">${escapeHTML(y)}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  // Generazione delle card classiche sottostanti
  const cardsHTML = years.map(y => `
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

  container.innerHTML = timelineHTML + '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px;">' + cardsHTML + '</div>';
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

async function deleteBook(id) {
  const target = books.find(item => item.id == decodeURIComponent(id));
  if (!target) return;

  if (!confirm('Vuoi rimuovere questo libro dalla libreria?')) return;

  try {
    await idbDelete(target.id);
  } catch (err) {
    showStorageError(err);
    return;
  }

  books = books.filter(item => item.id !== target.id);
  updateDatalists();
  renderHome();
  renderYearsCards();

  if (!document.getElementById('year-details').classList.contains('hidden')) {
    closeYearDetails();
  }
  if (!document.getElementById('overview-detail').classList.contains('hidden')) {
    closeOverviewDetail();
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
// Ripristino JSON
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

  reader.onload = async function (e) {
    let parsed;
    try {
      parsed = JSON.parse(e.target.result);
    } catch (err) {
      console.error('JSON non valido:', err);
      alert('Il file non è un JSON valido: ' + err.message);
      input.value = '';
      return;
    }

    if (!Array.isArray(parsed) && parsed && Array.isArray(parsed.books)) {
      parsed = parsed.books;
    }
    if (!Array.isArray(parsed)) {
      alert('Formato non riconosciuto: mi aspettavo una lista di libri.');
      input.value = '';
      return;
    }

    const cleaned = normalizeList(parsed);
    if (cleaned.length === 0) {
      alert('Il file non contiene libri validi.');
      input.value = '';
      return;
    }

    try {
      await idbReplaceAll(cleaned);
    } catch (err) {
      showStorageError(err);
      input.value = '';
      return;
    }
    books = cleaned;

    try {
      updateDatalists();
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
async function clearAllData() {
  if (!confirm('Attenzione: questa azione eliminerà tutti i libri salvati. Vuoi procedere?')) return;

  try {
    await idbClear();
  } catch (err) {
    showStorageError(err);
    return;
  }

  books = [];
  updateDatalists();
  renderHome();
  renderYearsCards();
  closeYearDetails();
  closeOverviewDetail();
  switchOverviewTab(currentOverviewTab);
  alert('Tutti i dati sono stati cancellati.');
}
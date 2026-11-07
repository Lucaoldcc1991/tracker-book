let books = JSON.parse(localStorage.getItem('tb_books')) || [];
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

function saveToStorage() {
  localStorage.setItem('tb_books', JSON.stringify(books));
  updateDatalists();
}

function switchTab(tabId, title, iconSymbol, btnElement) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'));

  document.getElementById(`sec-${tabId}`).classList.add('active');
  document.getElementById('page-title').innerText = title;
  document.getElementById('header-icon').innerText = iconSymbol;
  
  if(btnElement) btnElement.classList.add('active');

  if(tabId === 'home') renderHome();
  if(tabId === 'libri') renderYearsCards();
  if(tabId === 'panoramica') switchOverviewTab(currentOverviewTab);
}

function setFormat(fmt) {
  document.getElementById('inp-format').value = fmt;
  document.getElementById('btn-cartaceo').classList.toggle('active', fmt === 'Cartaceo');
  document.getElementById('btn-ebook').classList.toggle('active', fmt === 'Ebook');
}

function toggleForm() {
  const form = document.getElementById('book-form');
  form.classList.toggle('hidden');
  if(form.classList.contains('hidden')) {
    form.reset();
    editingId = null;
    currentCoverBase64 = '';
    document.getElementById('form-title').innerText = "Nuovo Libro";
    document.getElementById('cover-preview-container').classList.add('hidden');
  }
}

// Anteprima e compressione immagine
function previewThumbnail(event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.src = e.target.result;
      img.onload = function() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const MAX_WIDTH = 300;
        const MAX_HEIGHT = 450;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
        } else {
          if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        
        currentCoverBase64 = canvas.toDataURL('image/jpeg', 0.85);
        document.getElementById('cover-preview').src = currentCoverBase64;
        document.getElementById('cover-preview-container').classList.remove('hidden');
      }
    }
    reader.readAsDataURL(file);
  }
}

// Salvataggio Libro con supporto ID univoco
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
    copertina: coverToSave || 'https://via.placeholder.com/65x95?text=Libro'
  };

  if(editingId !== null) {
    const index = books.findIndex(b => b.id == editingId);
    if(index !== -1) {
      books[index] = bookData;
    } else {
      books.push(bookData);
    }
  } else {
    books.push(bookData);
  }

  saveToStorage();
  toggleForm();
  renderHome();
  renderYearsCards();
});

// Rendering HOME: solo anno corrente, ultimo letto in cima, pagine intere
function renderHome() {
  const currentYear = new Date().getFullYear().toString();
  
  let totalPages = 0, totalCartaceo = 0, totalEbook = 0;
  let yearBooks = 0, yearCartaceo = 0, yearEbook = 0, yearPages = 0;

  books.forEach(b => {
    totalPages += Math.round(b.pagine || 0);
    if(b.formato === 'Cartaceo') totalCartaceo++;
    if(b.formato === 'Ebook') totalEbook++;

    if(b.dataFine && b.dataFine.startsWith(currentYear)) {
      yearBooks++;
      yearPages += Math.round(b.pagine || 0);
      if(b.formato === 'Cartaceo') yearCartaceo++;
      if(b.formato === 'Ebook') yearEbook++;
    }
  });

  document.getElementById('stat-total-books').innerHTML = `${books.length} <span class="unit">libri</span>`;
  document.getElementById('stat-total-pages').innerText = `${Math.round(totalPages).toLocaleString()} pagine lette`;
  document.getElementById('stat-total-cartaceo').innerText = `📖 ${totalCartaceo} cartacei`;
  document.getElementById('stat-total-ebook').innerText = `📱 ${totalEbook} ebook`;

  document.getElementById('stat-year-books').innerHTML = `${yearBooks} <span class="unit">libri</span>`;
  document.getElementById('stat-year-pages').innerText = `${Math.round(yearPages).toLocaleString()} pagine quest'anno`;
  document.getElementById('stat-year-cartaceo').innerText = `📖 ${yearCartaceo} cartacei`;
  document.getElementById('stat-year-ebook').innerText = `📱 ${yearEbook} ebook`;

  const currentYearBooks = books
    .filter(b => b.dataFine && b.dataFine.startsWith(currentYear))
    .sort((a,b) => new Date(b.dataFine) - new Date(a.dataFine));

  const container = document.getElementById('home-book-list');
  container.innerHTML = currentYearBooks.map(b => renderBookCardHTML(b)).join('');
}

// Rendering Anni: pagine intere arrotondate
function renderYearsCards() {
  const container = document.getElementById('years-cards-container');
  const yearsMap = {};

  books.forEach(b => {
    const y = b.dataFine ? b.dataFine.split('-')[0] : 'Senza Data';
    if(!yearsMap[y]) yearsMap[y] = { cartaceo: 0, ebook: 0, count: 0, pages: 0 };
    yearsMap[y].count++;
    yearsMap[y].pages += Math.round(b.pagine || 0);
    if(b.formato === 'Cartaceo') yearsMap[y].cartaceo++;
    if(b.formato === 'Ebook') yearsMap[y].ebook++;
  });

  const years = Object.keys(yearsMap).sort((a,b) => b - a);
  container.innerHTML = years.map(y => `
    <div class="shelf-tile" onclick="openYearDetails('${y}')">
      <div class="tile-title">${y}</div>
      <div class="tile-count">${yearsMap[y].count} libri (${Math.round(yearsMap[y].pages).toLocaleString()} pag.)</div>
      <div class="stat-breakdown-row" style="margin-top:12px; font-size:14px;">
        <span>📖 ${yearsMap[y].cartaceo}</span>
        <span>•</span>
        <span>📱 ${yearsMap[y].ebook}</span>
      </div>
    </div>
  `).join('');
}

function openYearDetails(year) {
  document.getElementById('years-cards-container').classList.add('hidden');
  const details = document.getElementById('year-details');
  details.classList.remove('hidden');
  document.getElementById('selected-year-title').innerText = `Scaffale Anno ${year}`;

  const filtered = books
    .filter(b => (b.dataFine ? b.dataFine.startsWith(year) : year === 'Senza Data'))
    .sort((a,b) => new Date(a.dataFine) - new Date(b.dataFine));

  document.getElementById('year-book-list').innerHTML = filtered.map(b => renderBookCardHTML(b, true)).join('');
}

function closeYearDetails() {
  document.getElementById('year-details').classList.add('hidden');
  document.getElementById('years-cards-container').classList.remove('hidden');
}

// Panoramica: senza box vuote per serie/tag
function switchOverviewTab(type) {
  currentOverviewTab = type;

  document.getElementById('btn-ov-authors').classList.toggle('active', type === 'authors');
  document.getElementById('btn-ov-series').classList.toggle('active', type === 'series');
  document.getElementById('btn-ov-formats').classList.toggle('active', type === 'formats');

  closeOverviewDetail();

  const grid = document.getElementById('overview-grid');
  let groups = {};

  books.forEach(b => {
    let key = '';
    if(type === 'authors') {
      key = b.autore || '';
    }
    if(type === 'series') {
      key = b.serie ? b.serie.trim() : '';
      if(!key) return;
    }
    if(type === 'formats') {
      if(b.formato === 'Cartaceo') key = '📖 Cartaceo';
      else if(b.formato === 'Ebook') key = '📱 Ebook';
      else key = b.formato || 'Altro';
    }

    if(key) {
      if(!groups[key]) groups[key] = [];
      groups[key].push(b);
    }
  });

  let keys = Object.keys(groups);
  keys.sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));

  grid.innerHTML = keys.map(k => `
    <div class="shelf-tile" onclick="openOverviewDetail('${type}', '${encodeURIComponent(k)}')">
      <div class="tile-title">${k}</div>
      <div class="tile-count">${groups[k].length} libri letti</div>
    </div>
  `).join('');
}

function openOverviewDetail(type, encodedKey) {
  const key = decodeURIComponent(encodedKey);
  document.getElementById('overview-grid').classList.add('hidden');
  const detail = document.getElementById('overview-detail');
  detail.classList.remove('hidden');

  document.getElementById('overview-detail-title').innerText = key;

  const filtered = books.filter(b => {
    if(type === 'authors') return (b.autore || '') === key;
    if(type === 'series') return (b.serie ? b.serie.trim() : '') === key;
    if(type === 'formats') {
      const fmtKey = b.formato === 'Cartaceo' ? '📖 Cartaceo' : (b.formato === 'Ebook' ? '📱 Ebook' : b.formato);
      return fmtKey === key;
    }
  }).sort((a,b) => new Date(a.dataFine) - new Date(b.dataFine));

  document.getElementById('overview-detail-list').innerHTML = filtered.map(b => renderBookCardHTML(b, true)).join('');
}

function closeOverviewDetail() {
  document.getElementById('overview-detail').classList.add('hidden');
  document.getElementById('overview-grid').classList.remove('hidden');
}

// Scheda libro
function renderBookCardHTML(b, showActions = false) {
  let formattedDate = 'N/D';
  if(b.dataFine) {
    const dateObj = new Date(b.dataFine);
    if(!isNaN(dateObj)) {
      const options = { day: 'numeric', month: 'long', year: 'numeric' };
      formattedDate = dateObj.toLocaleDateString('it-IT', options);
    }
  }

  return `
    <div class="book-card">
      <img src="${b.copertina}" class="book-cover" alt="copertina">
      <div class="book-info">
        <h4>${b.titolo}</h4>
        <p><strong>Autore:</strong> ${b.autore}</p>
        <p><strong>Anno:</strong> ${b.anno || 'N/D'} &nbsp;|&nbsp; <strong>Serie / Tag:</strong> ${b.serie || '-'}</p>
        <p><strong>Pagine:</strong> ${Math.round(b.pagine || 0)} &nbsp;|&nbsp; <strong>Formato:</strong> ${b.formato}</p>
        <p><strong>Terminato il:</strong> ${formattedDate}</p>
        ${showActions ? `
          <div class="action-buttons">
            <button class="action-btn btn-edit" onclick="editBook('${b.id}')">Modifica</button>
            <button class="action-btn btn-delete" onclick="deleteBook('${b.id}')">Elimina</button>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

// Modifica con scroll automatico in alto
function editBook(id) {
  const bookToEdit = books.find(item => item.id == id);
  if(!bookToEdit) return;

  editingId = bookToEdit.id;
  
  document.getElementById('inp-title').value = bookToEdit.titolo;
  document.getElementById('inp-author').value = bookToEdit.autore;
  document.getElementById('inp-pages').value = bookToEdit.pagine;
  document.getElementById('inp-year').value = bookToEdit.anno || '';
  document.getElementById('inp-serie').value = bookToEdit.serie || '';
  document.getElementById('inp-edition').value = bookToEdit.edizione || '';
  document.getElementById('inp-date-end').value = bookToEdit.dataFine;
  currentCoverBase64 = bookToEdit.copertina;
  
  if(bookToEdit.copertina && bookToEdit.copertina.startsWith('data:image')) {
    document.getElementById('cover-preview').src = bookToEdit.copertina;
    document.getElementById('cover-preview-container').classList.remove('hidden');
  } else {
    document.getElementById('cover-preview-container').classList.add('hidden');
  }
  
  setFormat(bookToEdit.formato);
  document.getElementById('form-title').innerText = "Modifica Libro";
  
  closeYearDetails();
  closeOverviewDetail();
  
  switchTab('libri', 'Libreria', '📚', document.querySelectorAll('.tab-item')[1]);
  document.getElementById('book-form').classList.remove('hidden');
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteBook(id) {
  if(confirm('Vuoi rimuovere questo libro dalla libreria?')) {
    books = books.filter(item => item.id != id);
    saveToStorage();
    renderHome();
    renderYearsCards();
    if(!document.getElementById('overview-detail').classList.contains('hidden')) {
      closeOverviewDetail();
    }
  }
}

function updateDatalists() {
  const authors = [...new Set(books.map(b => b.autore).filter(Boolean))];
  const series = [...new Set(books.map(b => b.serie).filter(Boolean))];

  document.getElementById('list-authors').innerHTML = authors.map(a => `<option value="${a}">`).join('');
  document.getElementById('list-series').innerHTML = series.map(s => `<option value="${s}">`).join('');
}

// Export CSV
async function exportData(type) {
  const res = await fetch(`/api/export/${type}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ books })
  });
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `libri_letti.${type}`;
  a.click();
}

// Backup JSON
function backupJSON() {
  const dataStr = JSON.stringify(books, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = "backup_tracker_book.json";
  document.body.appendChild(a);
  a.click();
  
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 100);
}

// Ripristino JSON flessibile e tollerante per evitare falsi errori
function restoreJSON(event) {
  const fileReader = new FileReader();
  fileReader.onload = function(e) {
    try {
      let parsedData = JSON.parse(e.target.result);
      
      if (!Array.isArray(parsedData) && parsedData.books && Array.isArray(parsedData.books)) {
        parsedData = parsedData.books;
      }

      if (Array.isArray(parsedData)) {
        books = parsedData;
        saveToStorage();
        renderHome();
        renderYearsCards();
        if(typeof closeYearDetails === 'function') closeYearDetails();
        if(typeof closeOverviewDetail === 'function') closeOverviewDetail();
        
        alert('Ripristino completato con successo!');
      } else {
        if (typeof parsedData === 'object' && parsedData !== null) {
          books = Object.values(parsedData);
          saveToStorage();
          renderHome();
          renderYearsCards();
          if(typeof closeYearDetails === 'function') closeYearDetails();
          if(typeof closeOverviewDetail === 'function') closeOverviewDetail();
          
          alert('Ripristino completato con successo!');
        } else {
          throw new Error('Formato non riconosciuto');
        }
      }
    } catch(err) {
      console.error("Errore di parsing JSON:", err);
      alert('Il file di backup selezionato non è valido o è corrotto.');
    }
  };
  fileReader.readAsText(event.target.files[0], "UTF-8");
}

function clearAllData() {
  if(confirm('Attenzione: questa azione eliminerà tutti i libri salvati. Vuoi procedere?')) {
    books = [];
    saveToStorage();
    renderHome();
    renderYearsCards();
    closeYearDetails();
    closeOverviewDetail();
    switchOverviewTab(currentOverviewTab);
    alert('Tutti i dati sono stati cancellati.');
  }
}
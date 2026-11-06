let books = JSON.parse(localStorage.getItem('tb_books')) || [];
let editingIndex = null;
let currentOverviewTab = 'authors';

document.addEventListener('DOMContentLoaded', () => {
  renderHome();
  renderYearsCards();
  updateDatalists();
});

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
    editingIndex = null;
    document.getElementById('form-title').innerText = "Nuovo Libro";
  }
}

// Gestione Salvataggio Libro
document.getElementById('book-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const fileInput = document.getElementById('inp-cover');
  let coverUrl = document.getElementById('inp-cover-url').value;

  if (fileInput.files.length > 0) {
    const formData = new FormData();
    formData.append('cover', fileInput.files[0]);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if(data.url) coverUrl = data.url;
    } catch(err) {
      console.log("Upload in fallback locale");
    }
  }

  const bookData = {
    id: editingIndex !== null ? books[editingIndex].id : Date.now(),
    titolo: document.getElementById('inp-title').value,
    autore: document.getElementById('inp-author').value,
    pagine: parseInt(document.getElementById('inp-pages').value) || 0,
    anno: document.getElementById('inp-year').value,
    serie: document.getElementById('inp-serie').value,
    edizione: document.getElementById('inp-edition').value,
    formato: document.getElementById('inp-format').value,
    dataFine: document.getElementById('inp-date-end').value,
    copertina: coverUrl || 'https://via.placeholder.com/70x105?text=Libro'
  };

  if(editingIndex !== null) {
    books[editingIndex] = bookData;
  } else {
    books.push(bookData);
  }

  saveToStorage();
  toggleForm();
  renderHome();
  renderYearsCards();
});

// Rendering HOME con statistiche calde e pagine visibili
function renderHome() {
  const currentYear = new Date().getFullYear().toString();
  
  let totalPages = 0, totalCartaceo = 0, totalEbook = 0;
  let yearBooks = 0, yearCartaceo = 0, yearEbook = 0, yearPages = 0;

  const sortedBooks = [...books].sort((a,b) => new Date(b.dataFine) - new Date(a.dataFine));

  books.forEach(b => {
    totalPages += b.pagine;
    if(b.formato === 'Cartaceo') totalCartaceo++;
    if(b.formato === 'Ebook') totalEbook++;

    if(b.dataFine && b.dataFine.startsWith(currentYear)) {
      yearBooks++;
      yearPages += b.pagine;
      if(b.formato === 'Cartaceo') yearCartaceo++;
      if(b.formato === 'Ebook') yearEbook++;
    }
  });

  // Totale Globale
  document.getElementById('stat-total-books').innerHTML = `${books.length} <span class="unit">libri</span>`;
  document.getElementById('stat-total-pages').innerText = `${totalPages.toLocaleString()} pagine totali`;
  document.getElementById('stat-total-cartaceo').innerText = `📖 ${totalCartaceo} cartacei`;
  document.getElementById('stat-total-ebook').innerText = `📱 ${totalEbook} ebook`;

  // Anno Corrente
  document.getElementById('stat-year-books').innerHTML = `${yearBooks} <span class="unit">libri</span>`;
  document.getElementById('stat-year-pages').innerText = `${yearPages.toLocaleString()} pagine quest'anno`;
  document.getElementById('stat-year-cartaceo').innerText = `📖 ${yearCartaceo} cartacei`;
  document.getElementById('stat-year-ebook').innerText = `📱 ${yearEbook} ebook`;

  const container = document.getElementById('home-book-list');
  container.innerHTML = sortedBooks.map(b => renderBookCardHTML(b)).join('');
}

// Rendering Anni nella sezione Libri
function renderYearsCards() {
  const container = document.getElementById('years-cards-container');
  const yearsMap = {};

  books.forEach(b => {
    const y = b.dataFine ? b.dataFine.split('-')[0] : 'Senza Data';
    if(!yearsMap[y]) yearsMap[y] = { cartaceo: 0, ebook: 0, count: 0 };
    yearsMap[y].count++;
    if(b.formato === 'Cartaceo') yearsMap[y].cartaceo++;
    if(b.formato === 'Ebook') yearsMap[y].ebook++;
  });

  const years = Object.keys(yearsMap).sort((a,b) => b - a);
  container.innerHTML = years.map(y => `
    <div class="shelf-tile" onclick="openYearDetails('${y}')">
      <div class="tile-title">${y}</div>
      <div class="tile-count">${yearsMap[y].count} letture</div>
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

// Panoramica App-Style
function switchOverviewTab(type) {
  currentOverviewTab = type;

  document.getElementById('btn-ov-authors').classList.toggle('active', type === 'authors');
  document.getElementById('btn-ov-series').classList.toggle('active', type === 'series');
  document.getElementById('btn-ov-formats').classList.toggle('active', type === 'formats');

  closeOverviewDetail();

  const grid = document.getElementById('overview-grid');
  let groups = {};

  books.forEach(b => {
    let key = 'Non specificato';
    if(type === 'authors') key = b.autore || 'Senza Autore';
    if(type === 'series') key = b.serie || 'Senza Serie/Argomento';
    if(type === 'formats') key = b.formato || 'Altro';

    if(!groups[key]) groups[key] = [];
    groups[key].push(b);
  });

  const keys = Object.keys(groups).sort((a,b) => a.localeCompare(b));

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
    if(type === 'authors') return (b.autore || 'Senza Autore') === key;
    if(type === 'series') return (b.serie || 'Senza Serie/Argomento') === key;
    if(type === 'formats') return (b.formato || 'Altro') === key;
  }).sort((a,b) => new Date(a.dataFine) - new Date(b.dataFine));

  document.getElementById('overview-detail-list').innerHTML = filtered.map(b => renderBookCardHTML(b, true)).join('');
}

function closeOverviewDetail() {
  document.getElementById('overview-detail').classList.add('hidden');
  document.getElementById('overview-grid').classList.remove('hidden');
}

// Card Libro Unificata
function renderBookCardHTML(b, showActions = false) {
  const index = books.findIndex(item => item.id === b.id);
  return `
    <div class="book-card">
      <img src="${b.copertina}" class="book-cover" alt="copertina">
      <div class="book-info">
        <h4>${b.titolo}</h4>
        <p><strong>Autore:</strong> ${b.autore}</p>
        <p><strong>Formato:</strong> ${b.formato} • ${b.pagine} pag.</p>
        ${b.serie ? `<p><strong>Serie:</strong> ${b.serie}</p>` : ''}
        <p><strong>Terminato:</strong> ${b.dataFine || 'N/D'}</p>
        ${showActions ? `
          <div class="action-buttons">
            <button class="action-btn btn-edit" onclick="editBook(${index})">Modifica</button>
            <button class="action-btn btn-delete" onclick="deleteBook(${index})">Elimina</button>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function editBook(index) {
  editingIndex = index;
  const b = books[index];
  document.getElementById('inp-title').value = b.titolo;
  document.getElementById('inp-author').value = b.autore;
  document.getElementById('inp-pages').value = b.pagine;
  document.getElementById('inp-year').value = b.anno || '';
  document.getElementById('inp-serie').value = b.serie || '';
  document.getElementById('inp-edition').value = b.edizione || '';
  document.getElementById('inp-date-end').value = b.dataFine;
  document.getElementById('inp-cover-url').value = b.copertina.startsWith('http') ? b.copertina : '';
  setFormat(b.formato);

  document.getElementById('form-title').innerText = "Modifica Libro";
  closeYearDetails();
  closeOverviewDetail();
  
  switchTab('libri', 'Libreria', '📚', document.querySelectorAll('.tab-item')[1]);
  document.getElementById('book-form').classList.remove('hidden');
}

function deleteBook(index) {
  if(confirm('Vuoi rimuovere questo libro dalla libreria?')) {
    books.splice(index, 1);
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

// Backup & Export
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

function backupJSON() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(books));
  const dlAnchorElem = document.createElement('a');
  dlAnchorElem.setAttribute("href", dataStr);
  dlAnchorElem.setAttribute("download", "backup_tracker_book.json");
  dlAnchorElem.click();
}

function restoreJSON(event) {
  const fileReader = new FileReader();
  fileReader.onload = function(e) {
    try {
      books = JSON.parse(e.target.result);
      saveToStorage();
      alert('Ripristino completato con successo!');
      renderHome();
    } catch(err) {
      alert('File di backup non valido!');
    }
  };
  fileReader.readAsText(event.target.files[0]);
}

function clearAllData() {
  if(confirm('Attenzione: questa azione eliminerà tutti i libri salvati. Vuoi procedere?')) {
    books = [];
    saveToStorage();
    renderHome();
    renderYearsCards();
    alert('Tutti i dati sono stati cancellati.');
  }
}
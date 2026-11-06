let books = JSON.parse(localStorage.getItem('tb_books')) || [];
let editingIndex = null;

document.addEventListener('DOMContentLoaded', () => {
  renderHome();
  renderYearsCards();
  updateDatalists();
});

function saveToStorage() {
  localStorage.setItem('tb_books', JSON.stringify(books));
  updateDatalists();
}

function switchTab(tabId, title) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'));

  document.getElementById(`sec-${tabId}`).classList.add('active');
  document.getElementById('page-title').innerText = title;
  
  event.currentTarget.classList.add('active');

  if(tabId === 'home') renderHome();
  if(tabId === 'libri') renderYearsCards();
  if(tabId === 'panoramica') switchOverviewTab('authors');
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
      console.log("Upload file locale fallito, uso base64 o placeholder");
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
    copertina: coverUrl || 'https://via.placeholder.com/60x90?text=No+Cover'
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

// Rendering Home
function renderHome() {
  const currentYear = new Date().getFullYear().toString();
  let totalPages = 0;
  let yearBooks = 0, yearCartaceo = 0, yearEbook = 0;

  const sortedBooks = [...books].sort((a,b) => new Date(b.dataFine) - new Date(a.dataFine));

  books.forEach(b => {
    totalPages += b.pagine;
    if(b.dataFine && b.dataFine.startsWith(currentYear)) {
      yearBooks++;
      if(b.formato === 'Cartaceo') yearCartaceo++;
      if(b.formato === 'Ebook') yearEbook++;
    }
  });

  document.getElementById('stat-total-books').innerText = `${books.length} libri`;
  document.getElementById('stat-total-pages').innerText = `${totalPages.toLocaleString()} pagine`;
  document.getElementById('stat-year-books').innerText = `${yearBooks} libri`;
  document.getElementById('stat-year-breakdown').innerText = `Cartaceo: ${yearCartaceo} | Ebook: ${yearEbook}`;

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
    <div class="stat-card mb-15" style="cursor:pointer;" onclick="openYearDetails('${y}')">
      <h3>Anno ${y}</h3>
      <p>${yearsMap[y].count} libri letti</p>
      <span>Cartaceo: ${yearsMap[y].cartaceo} | Ebook: ${yearsMap[y].ebook}</span>
    </div>
  `).join('');
}

function openYearDetails(year) {
  document.getElementById('years-cards-container').classList.add('hidden');
  const details = document.getElementById('year-details');
  details.classList.remove('hidden');
  document.getElementById('selected-year-title').innerText = `Libri Letti nel ${year}`;

  const filtered = books
    .filter(b => (b.dataFine ? b.dataFine.startsWith(year) : year === 'Senza Data'))
    .sort((a,b) => new Date(a.dataFine) - new Date(b.dataFine));

  document.getElementById('year-book-list').innerHTML = filtered.map(b => renderBookCardHTML(b, true)).join('');
}

function closeYearDetails() {
  document.getElementById('year-details').classList.add('hidden');
  document.getElementById('years-cards-container').classList.remove('hidden');
}

// Panoramica
function switchOverviewTab(type) {
  const container = document.getElementById('overview-content');
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

  container.innerHTML = keys.map(k => {
    const sortedList = groups[k].sort((a,b) => new Date(a.dataFine) - new Date(b.dataFine));
    return `
      <div class="settings-group">
        <h3>${k} (${sortedList.length})</h3>
        ${sortedList.map(b => renderBookCardHTML(b)).join('')}
      </div>
    `;
  }).join('');
}

// Helper Card HTML
function renderBookCardHTML(b, showActions = false) {
  const index = books.findIndex(item => item.id === b.id);
  return `
    <div class="book-card">
      <img src="${b.copertina}" class="book-cover" alt="copertina">
      <div class="book-info">
        <h4>${b.titolo}</h4>
        <p><strong>Autore:</strong> ${b.autore}</p>
        <p><strong>Formato:</strong> ${b.formato} (${b.pagine} pag.)</p>
        <p><strong>Finito il:</strong> ${b.dataFine || 'N/D'}</p>
        ${showActions ? `
          <div style="margin-top:5px;">
            <button onclick="editBook(${index})" style="color:var(--accent); background:none; border:none; padding:0; margin-right:10px;">Modifica</button>
            <button onclick="deleteBook(${index})" style="color:var(--danger); background:none; border:none; padding:0;">Elimina</button>
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

  closeYearDetails();
  document.getElementById('book-form').classList.remove('hidden');
}

function deleteBook(index) {
  if(confirm('Vuoi davvero eliminare questo libro?')) {
    books.splice(index, 1);
    saveToStorage();
    renderYearsCards();
    renderHome();
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
      alert('Ripristino completato!');
      renderHome();
    } catch(err) {
      alert('File non valido!');
    }
  };
  fileReader.readAsText(event.target.files[0]);
}

function clearAllData() {
  if(confirm('Attenzione: questa azione cancellerà tutti i libri inseriti. Continuare?')) {
    books = [];
    saveToStorage();
    renderHome();
    alert('Tutti i dati sono stati cancellati.');
  }
}
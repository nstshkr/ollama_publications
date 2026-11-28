let notes = JSON.parse(localStorage.getItem('my_notes')) || [];
let folders = JSON.parse(localStorage.getItem('my_folders')) || [];
let currentFolder = null; // null = Все, 'none' = Без папки, id = конкретная папка
let selectedNotes = new Set();
let selectedColor = 'bg-white';

const grid = document.getElementById('notes-grid');
const emptyState = document.getElementById('empty-notes');
const actionBar = document.getElementById('floating-action-bar');
const selectedCount = document.getElementById('selected-count');
const folderTitle = document.getElementById('current-folder-title');
const publishAllBtn = document.getElementById('publish-all-btn');

const ollamaModal = new bootstrap.Modal(document.getElementById('ollamaModal'));
const noteModal = new bootstrap.Modal(document.getElementById('createNoteModal'));
const folderModal = new bootstrap.Modal(document.getElementById('createFolderModal'));
const confirmModal = new bootstrap.Modal(document.getElementById('confirmModal'));

let confirmCallback = null; // Функция, которая вызовется при подтверждении

// --- КРАСИВОЕ ПОДТВЕРЖДЕНИЕ ---
function showConfirm(title, text, callback) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-text').textContent = text;
  confirmCallback = callback;
  confirmModal.show();
}

document.getElementById('confirm-yes-btn').addEventListener('click', () => {
  if (confirmCallback) confirmCallback();
  confirmModal.hide();
});

// --- РЕНДЕР ПАПОК ---
function renderFolders() {
  const list = document.getElementById('sidebar-folders');
  
  const isAllActive = currentFolder === null;
  const isNoneActive = currentFolder === 'none';
  
  list.innerHTML = `
    <button class="list-group-item list-group-item-action ${isAllActive ? 'active' : ''}" onclick="setFolder(null, 'Все заметки')">
      <i class="bi bi-collection me-2"></i>Все заметки
    </button>
    <button class="list-group-item list-group-item-action ${isNoneActive ? 'active' : ''}" onclick="setFolder('none', 'Без папки')">
      <i class="bi bi-folder me-2"></i>Без папки
    </button>
  `;

  folders.forEach(f => {
    const isActive = currentFolder === f.id;
    list.innerHTML += `
      <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center ${isActive ? 'active' : ''}" onclick="setFolder(${f.id}, '${escapeHtml(f.name)}')">
        <span><i class="bi bi-folder-fill me-2 ${isActive ? 'text-white' : 'text-warning'}"></i>${escapeHtml(f.name)}</span>
        <i class="bi bi-x-circle ${isActive ? 'text-white' : 'text-danger'} opacity-75" onclick="deleteFolder(${f.id}, event)" title="Удалить папку"></i>
      </div>
    `;
  });

  list.innerHTML += `
    <button class="list-group-item list-group-item-action text-primary fw-medium" onclick="openFolderModal()">
      <i class="bi bi-folder-plus me-2"></i>Создать папку
    </button>
  `;
}

window.openFolderModal = function() {
  document.getElementById('new-folder-name').value = '';
  folderModal.show();
};

window.createFolder = function() {
  const name = document.getElementById('new-folder-name').value.trim();
  if (!name) return;
  folders.push({ id: Date.now(), name });
  localStorage.setItem('my_folders', JSON.stringify(folders));
  folderModal.hide();
  renderFolders();
};

window.deleteFolder = function(id, event) {
  event.stopPropagation();
  showConfirm('Удалить папку?', 'Заметки из неё переместятся в "Без папки".', () => {
    folders = folders.filter(f => f.id !== id);
    notes.forEach(n => { if (n.folderId === id) n.folderId = 'none'; });
    localStorage.setItem('my_folders', JSON.stringify(folders));
    localStorage.setItem('my_notes', JSON.stringify(notes));
    if (currentFolder === id) setFolder(null, 'Все заметки');
    renderFolders();
    renderNotes();
  });
};

window.setFolder = function(id, name) {
  currentFolder = id;
  folderTitle.textContent = name;
  selectedNotes.clear();
  updateActionBar();
  renderFolders();
  renderNotes();
  
  if (id !== null && notes.some(n => n.folderId === id)) {
    publishAllBtn.classList.remove('d-none');
  } else {
    publishAllBtn.classList.add('d-none');
  }
};

// --- РЕНДЕР ЗАМЕТОК ---
function renderNotes() {
  grid.innerHTML = '';
  
  let filteredNotes = notes;
  if (currentFolder === 'none') {
    filteredNotes = notes.filter(n => !n.folderId || n.folderId === 'none');
  } else if (currentFolder !== null) {
    filteredNotes = notes.filter(n => n.folderId === currentFolder);
  }

  if (filteredNotes.length === 0) {
    emptyState.classList.remove('d-none');
    return;
  }
  emptyState.classList.add('d-none');

  filteredNotes.forEach((note) => {
    const isSelected = selectedNotes.has(note.id);
    const date = new Date(note.id).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    const bgColor = note.color || 'bg-white';
    
    const folderOptions = folders.map(f => `<li><a class="dropdown-item small" href="#" onclick="moveToFolder(${note.id}, ${f.id}, event)">${escapeHtml(f.name)}</a></li>`).join('');
    const moveDropdown = `
      <div class="dropdown position-absolute top-0 end-0 mt-1 me-2" onclick="event.stopPropagation()">
        <button class="btn btn-sm text-muted" data-bs-toggle="dropdown"><i class="bi bi-folder-symlink"></i></button>
        <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0">
          <li><h6 class="dropdown-header">Переместить в:</h6></li>
          ${folderOptions}
          <li><hr class="dropdown-divider"></li>
          <li><a class="dropdown-item small text-muted" href="#" onclick="moveToFolder(${note.id}, 'none', event)">Без папки</a></li>
        </ul>
      </div>
    `;

    const card = `
      <div class="col-md-6 col-xl-4">
        <div class="card h-100 border ${isSelected ? 'border-primary shadow-lg' : 'border-light shadow-sm'} ${bgColor} rounded-3 position-relative note-card" style="transition: 0.2s;">
          
          <!-- Чекбокс для выбора (слева вверху) -->
          <div class="position-absolute top-0 start-0 m-3" onclick="event.stopPropagation()">
            <input class="form-check-input fs-5 mt-0 shadow-sm cursor-pointer" type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleSelect(${note.id})">
          </div>

          <!-- Меню перемещения (справа вверху) -->
          ${moveDropdown}

          <!-- Клик по этой области открывает редактирование -->
          <div class="card-body p-3 pt-5" onclick="openEditModal(${note.id})" style="cursor: pointer;">
            <p class="card-text mb-3" style="white-space: pre-wrap;">${escapeHtml(note.text)}</p>
            <div class="d-flex justify-content-between align-items-center mt-auto pt-2 border-top border-dark-subtle">
              <span class="text-muted" style="font-size: 0.75rem;">${date}</span>
              <button class="btn btn-sm text-danger p-0 delete-btn" onclick="deleteNote(${note.id}, event)">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    grid.insertAdjacentHTML('beforeend', card);
  });
}

window.moveToFolder = function(noteId, folderId, event) {
  event.stopPropagation();
  const note = notes.find(n => n.id === noteId);
  if (note) {
    note.folderId = folderId;
    localStorage.setItem('my_notes', JSON.stringify(notes));
    renderNotes();
  }
};

window.toggleSelect = function(id) {
  if (selectedNotes.has(id)) selectedNotes.delete(id);
  else selectedNotes.add(id);
  updateActionBar();
  renderNotes();
};

window.deleteNote = function(id, event) {
  event.stopPropagation();
  showConfirm('Удалить заметку?', 'Она исчезнет навсегда.', () => {
    notes = notes.filter(n => n.id !== id);
    selectedNotes.delete(id);
    localStorage.setItem('my_notes', JSON.stringify(notes));
    updateActionBar();
    renderNotes();
  });
};

function updateActionBar() {
  if (selectedNotes.size > 0) {
    actionBar.classList.remove('d-none');
    actionBar.classList.add('d-flex');
    selectedCount.textContent = selectedNotes.size;
  } else {
    actionBar.classList.add('d-none');
    actionBar.classList.remove('d-flex');
  }
}

// --- ВЫБОР ЦВЕТА ---
window.selectColor = function(el) {
  document.querySelectorAll('.color-option').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  selectedColor = el.dataset.color;
};

// --- СОЗДАНИЕ И РЕДАКТИРОВАНИЕ ЗАМЕТКИ ---
window.openCreateModal = function() {
  document.getElementById('noteModalTitle').textContent = 'Новая заметка';
  document.getElementById('edit-note-id').value = '';
  document.getElementById('new-note-text').value = '';
  resetColorPicker('bg-white');
  noteModal.show();
};

window.openEditModal = function(id) {
  const note = notes.find(n => n.id === id);
  if (!note) return;
  
  document.getElementById('noteModalTitle').textContent = 'Редактировать заметку';
  document.getElementById('edit-note-id').value = note.id;
  document.getElementById('new-note-text').value = note.text;
  resetColorPicker(note.color || 'bg-white');
  noteModal.show();
};

function resetColorPicker(color) {
  document.querySelectorAll('.color-option').forEach(c => c.classList.remove('selected'));
  const colorEl = document.querySelector(`.color-option[data-color="${color}"]`);
  if (colorEl) colorEl.classList.add('selected');
  selectedColor = color;
}

document.getElementById('save-note-btn').addEventListener('click', () => {
  const text = document.getElementById('new-note-text').value.trim();
  const editId = document.getElementById('edit-note-id').value;
  if (!text) return;

  if (editId) {
    // Редактирование существующей
    const note = notes.find(n => n.id == editId);
    if (note) {
      note.text = text;
      note.color = selectedColor;
    }
  } else {
    // Создание новой
    notes.unshift({ 
      id: Date.now(), 
      text: text, 
      color: selectedColor,
      folderId: currentFolder === null ? 'none' : currentFolder 
    });
  }
  
  localStorage.setItem('my_notes', JSON.stringify(notes));
  noteModal.hide();
  renderNotes();
  if(currentFolder !== null) setFolder(currentFolder, folderTitle.textContent);
});


// --- ГЕНЕРАЦИЯ ПОСТА (OLLAMA) ---
let notesToGenerate = [];

window.preparePostGeneration = function() {
  notesToGenerate = notes.filter(n => selectedNotes.has(n.id));
  startGeneration();
};

window.generatePostsFromCurrentFolder = function() {
  if (currentFolder === 'none') {
    notesToGenerate = notes.filter(n => !n.folderId || n.folderId === 'none');
  } else {
    notesToGenerate = notes.filter(n => n.folderId === currentFolder);
  }
  if (notesToGenerate.length === 0) return;
  startGeneration();
};

async function startGeneration() {
  const texts = notesToGenerate.map(n => n.text).filter(t => t && t.trim());
  if (!texts.length) return;
  const loading = document.getElementById('ollama-loading');
  const result = document.getElementById('ollama-result');
  loading.classList.remove('d-none');
  result.classList.add('d-none');
  const researchQuery = document.getElementById('research-query').value.trim();
  const researchStatus = document.getElementById('research-status');
  researchStatus.classList.add('d-none');
  researchStatus.textContent = '';
  ollamaModal.show();
  try {
    const response = await fetch('/api/posts/generate', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({notes: texts, research_query: researchQuery})});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Ошибка генерации');
    document.getElementById('post-title').value = data.title;
    document.getElementById('post-content').value = data.content;
    if (data.research_status) {
      researchStatus.textContent = data.research_status;
      researchStatus.classList.remove('d-none');
    }
    loading.classList.add('d-none');
    result.classList.remove('d-none');
  } catch (error) {
    ollamaModal.hide();
    alert(error.message);
  }
}

window.cancelPost = function() {
  notesToGenerate = [];
  ollamaModal.hide();
};

document.getElementById('publish-post-btn').addEventListener('click', async () => {
  const title = document.getElementById('post-title').value.trim();
  const content = document.getElementById('post-content').value.trim();
  const button = document.getElementById('publish-post-btn');
  button.disabled = true;
  try {
    const response = await fetch('/api/posts', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({title, content})});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Ошибка публикации');
  } catch (error) {
    alert(error.message);
    return;
  } finally {
    button.disabled = false;
  }
  selectedNotes.clear();
  updateActionBar();
  renderNotes();
  ollamaModal.hide();
  
  const toastContainer = document.getElementById('toastContainer');
  toastContainer.innerHTML = `
    <div class="toast align-items-center text-white bg-success border-0 shadow show" role="alert">
      <div class="d-flex">
        <div class="toast-body fw-medium"><i class="bi bi-check-circle me-1"></i> Пост опубликован!</div>
      </div>
    </div>
  `;
  setTimeout(() => toastContainer.innerHTML = '', 3000);
});

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Инициализация
renderFolders();
renderNotes();
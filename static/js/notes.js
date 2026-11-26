let notes = JSON.parse(localStorage.getItem('my_notes')) || [];

const noteInput = document.getElementById('note-input');
const addNoteBtn = document.getElementById('add-note-btn');
const notesList = document.getElementById('notes-list');
const emptyNotes = document.getElementById('empty-notes');
const createPostBtn = document.getElementById('create-post-btn');

function renderNotes() {
  notesList.innerHTML = '';
  if (notes.length === 0) {
    emptyNotes.classList.remove('d-none');
    return;
  }
  emptyNotes.classList.add('d-none');

  notes.forEach((note, index) => {
    const date = new Date(note.id).toLocaleString('ru-RU');
    const card = `
      <div class="col-md-6">
        <div class="card h-100 border-0 shadow-sm note-card">
          <div class="card-body">
            <div class="form-check mb-2">
              <input class="form-check-input note-checkbox" type="checkbox" value="${index}" id="note-${index}">
              <label class="form-check-label text-muted small" for="note-${index}">${date}</label>
            </div>
            <p class="card-text" style="white-space: pre-wrap;">${escapeHtml(note.text)}</p>
            <button class="btn btn-sm btn-outline-danger border-0 position-absolute bottom-0 end-0 m-2 delete-btn" data-index="${index}">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `;
    notesList.insertAdjacentHTML('beforeend', card);
  });

  updatePostBtnState();
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Добавление заметки
addNoteBtn.addEventListener('click', () => {
  const text = noteInput.value.trim();
  if (!text) return;
  notes.unshift({ id: Date.now(), text: text });
  localStorage.setItem('my_notes', JSON.stringify(notes));
  noteInput.value = '';
  renderNotes();
});

// Удаление заметки
notesList.addEventListener('click', (e) => {
  const btn = e.target.closest('.delete-btn');
  if (btn) {
    const index = btn.dataset.index;
    notes.splice(index, 1);
    localStorage.setItem('my_notes', JSON.stringify(notes));
    renderNotes();
  }
});

// Активация кнопки "Создать пост"
function updatePostBtnState() {
  const checked = document.querySelectorAll('.note-checkbox:checked');
  createPostBtn.disabled = checked.length === 0;
}

notesList.addEventListener('change', (e) => {
  if (e.target.classList.contains('note-checkbox')) {
    updatePostBtnState();
  }
});

// Имитация отправки поста (пока бэкенда нет)
createPostBtn.addEventListener('click', () => {
  const checked = document.querySelectorAll('.note-checkbox:checked');
  let combinedText = [];
  checked.forEach(cb => {
    combinedText.push(notes[cb.value].text);
  });
  
  // Здесь позже будет отправка на сервер
  showToast(`Пост создан! Объединено заметок: ${combinedText.length}`, 'success');
  
  // Снимаем выделение
  checked.forEach(cb => cb.checked = false);
  updatePostBtnState();
});

renderNotes();
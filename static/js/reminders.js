let reminders = JSON.parse(localStorage.getItem('my_reminders')) || [];

const reminderText = document.getElementById('reminder-text');
const reminderTimeInput = document.getElementById('reminder-datetime');
const addReminderBtn = document.getElementById('add-reminder-btn');
const remindersList = document.getElementById('reminders-list');
const emptyReminders = document.getElementById('empty-reminders');

// Настройка календаря
flatpickr(reminderTimeInput, {
  locale: "ru",
  enableTime: true,
  time_24hr: true,
  dateFormat: "Y-m-d H:i",
  altInput: true,
  altFormat: "d.m.Y H:i",
  minDate: "today", // Запрещаем дни из прошлого
});

function renderReminders() {
  remindersList.innerHTML = '';
  reminders.sort((a, b) => new Date(a.time) - new Date(b.time));

  if (reminders.length === 0) {
    emptyReminders.classList.remove('d-none');
    return;
  }
  emptyReminders.classList.add('d-none');

  reminders.forEach((rem, index) => {
    const date = new Date(rem.time.replace(' ', 'T')); 
    const formattedDate = date.toLocaleString('ru-RU', { 
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' 
    });
    
    const isPast = date < new Date();
    
    // Красивая карточка напоминания с явной кнопкой удаления
    const item = `
      <div class="list-group-item d-flex justify-content-between align-items-center p-3 border-0 border-bottom rounded-0 ${isPast ? 'bg-light opacity-75' : 'bg-white'}">
        <div class="d-flex flex-column">
          <span class="fw-bold mb-1 ${isPast ? 'text-muted text-decoration-line-through' : 'text-dark'}">${escapeHtml(rem.text)}</span>
          <span class="small ${isPast ? 'text-muted' : 'text-primary'}"><i class="bi bi-clock me-1"></i>${formattedDate}</span>
        </div>
        <button class="btn btn-sm btn-light text-danger rounded-circle delete-reminder" data-index="${index}" title="Удалить">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    `;
    remindersList.insertAdjacentHTML('beforeend', item);
  });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

addReminderBtn.addEventListener('click', () => {
  const text = reminderText.value.trim();
  const time = reminderTimeInput.value; // Формат Y-m-d H:i
  
  if (!text || !time) {
    showToast('Заполните текст и выберите время!', 'danger');
    return;
  }

  // Проверка: нельзя выбрать время в прошлом
  const selectedDate = new Date(time.replace(' ', 'T'));
  const now = new Date();
  
  if (selectedDate < now) {
    showToast('Нельзя создать напоминание на прошлое время!', 'danger');
    return;
  }

  reminders.push({ id: Date.now(), text, time, notified: false });
  localStorage.setItem('my_reminders', JSON.stringify(reminders));
  
  reminderText.value = '';
  reminderTimeInput._flatpickr.clear(); 
  
  renderReminders();
  showToast('Напоминание добавлено', 'success');
});

// Обработка удаления
remindersList.addEventListener('click', (e) => {
  const btn = e.target.closest('.delete-reminder');
  if (btn) {
    const index = btn.dataset.index;
    reminders.splice(index, 1);
    localStorage.setItem('my_reminders', JSON.stringify(reminders));
    renderReminders();
    showToast('Напоминание удалено', 'info');
  }
});

function showToast(message, type = 'info') {
  const toastContainer = document.getElementById('toastContainer');
  const toastId = 'toast-' + Date.now();
  const toastHtml = `
    <div id="${toastId}" class="toast align-items-center text-white bg-${type} border-0 shadow" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="d-flex">
        <div class="toast-body fw-medium">${message}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    </div>
  `;
  toastContainer.insertAdjacentHTML('beforeend', toastHtml);
  const toastElement = document.getElementById(toastId);
  const toast = new bootstrap.Toast(toastElement, { delay: 4000 });
  toast.show();
  toastElement.addEventListener('hidden.bs.toast', () => toastElement.remove());
}

// Проверка наступления времени
setInterval(() => {
  const currentTime = new Date();
  let updated = false;

  reminders.forEach((rem) => {
    const remTime = new Date(rem.time.replace(' ', 'T'));
    const diffSeconds = (currentTime - remTime) / 1000;
    
    // Если наступило время и уведомление еще не показано
    if (diffSeconds >= 0 && diffSeconds < 60 && !rem.notified) {
      showToast(`Напоминание: ${rem.text}`, 'primary');
      rem.notified = true;
      updated = true;
    }
  });

  if (updated) {
    localStorage.setItem('my_reminders', JSON.stringify(reminders));
    renderReminders();
  }
}, 5000);

renderReminders();
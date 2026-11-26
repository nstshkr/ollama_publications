let reminders = JSON.parse(localStorage.getItem('my_reminders')) || [];
const container = document.getElementById('reminders-container');
const emptyState = document.getElementById('empty-reminders');
const createReminderModal = new bootstrap.Modal(document.getElementById('createReminderModal'));

// Настройка календаря Flatpickr
flatpickr("#reminder-datetime", {
  locale: "ru",
  enableTime: true,
  time_24hr: true,
  dateFormat: "Y-m-d H:i",
  altInput: true,
  altFormat: "d.m.Y H:i",
  minDate: "today",
});

function renderReminders() {
  container.innerHTML = '';
  if (reminders.length === 0) {
    emptyState.classList.remove('d-none');
    return;
  }
  emptyState.classList.add('d-none');

  // Получаем сегодняшнюю дату (обнуляем время для корректного сравнения)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dayAfter = new Date(today);
  dayAfter.setDate(dayAfter.getDate() + 2);

  // Массивы для группировки
  const groups = {
    today: [],
    tomorrow: [],
    dayAfter: [],
    future: {}, // Здесь будут даты (ключ - "YYYY-MM-DD")
    done: []
  };

  reminders.forEach((rem, index) => {
    if (rem.done) {
      groups.done.push({ ...rem, originalIndex: index });
    } else {
      const remDate = new Date(rem.time.replace(' ', 'T'));
      const remDateZero = new Date(remDate);
      remDateZero.setHours(0, 0, 0, 0); // Обнуляем время для сравнения дней

      if (remDateZero.getTime() === today.getTime()) {
        groups.today.push({ ...rem, originalIndex: index });
      } else if (remDateZero.getTime() === tomorrow.getTime()) {
        groups.tomorrow.push({ ...rem, originalIndex: index });
      } else if (remDateZero.getTime() === dayAfter.getTime()) {
        groups.dayAfter.push({ ...rem, originalIndex: index });
      } else {
        // Для остальных дней создаем ключ по дате
        const dateKey = remDateZero.toISOString().split('T')[0];
        if (!groups.future[dateKey]) {
          groups.future[dateKey] = {
            title: remDateZero.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }),
            dateObj: remDateZero,
            items: []
          };
        }
        groups.future[dateKey].items.push({ ...rem, originalIndex: index });
      }
    }
  });

  // Функция отрисовки одного блока
  const renderGroup = (title, items) => {
    if (items.length === 0) return '';
    // Сортируем по времени внутри группы
    items.sort((a, b) => new Date(a.time.replace(' ', 'T')) - new Date(b.time.replace(' ', 'T')));
    
    const listItems = items.map(item => {
      const timeStr = new Date(item.time.replace(' ', 'T')).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      
      return `
        <div class="list-group-item d-flex justify-content-between align-items-center p-3 ${item.done ? 'bg-light opacity-75' : ''}">
          <div class="d-flex align-items-center gap-3">
            <input class="form-check-input mt-0 fs-5" type="checkbox" ${item.done ? 'checked' : ''} onchange="toggleDone(${item.originalIndex})">
            <div>
              <div class="fw-bold ${item.done ? 'text-decoration-line-through text-muted' : 'text-dark'}">${escapeHtml(item.text)}</div>
              ${!item.done ? `<div class="small text-primary mt-1"><i class="bi bi-clock me-1"></i>${timeStr}</div>` : ''}
            </div>
          </div>
          <button class="btn btn-sm text-danger delete-btn" onclick="deleteReminder(${item.originalIndex})">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      `;
    }).join('');

    return `
      <div class="mb-4">
        <h5 class="fw-bold mb-2 text-secondary text-uppercase" style="font-size: 0.85rem; letter-spacing: 1px;">${title}</h5>
        <div class="list-group shadow-sm rounded-3 overflow-hidden">
          ${listItems}
        </div>
      </div>
    `;
  };

  // Собираем итоговый HTML
  let html = '';
  html += renderGroup('Сегодня', groups.today);
  html += renderGroup('Завтра', groups.tomorrow);
  html += renderGroup('Послезавтра', groups.dayAfter);

  // Сортируем будущие даты по возрастанию и отрисовываем
  const sortedFutureKeys = Object.keys(groups.future).sort((a, b) => groups.future[a].dateObj - groups.future[b].dateObj);
  sortedFutureKeys.forEach(key => {
    html += renderGroup(groups.future[key].title, groups.future[key].items);
  });

  // Выполненные всегда в самом низу
  html += renderGroup('Выполненные', groups.done);

  container.innerHTML = html;
}

window.toggleDone = function(index) {
  reminders[index].done = !reminders[index].done;
  localStorage.setItem('my_reminders', JSON.stringify(reminders));
  renderReminders();
};

window.deleteReminder = function(index) {
  reminders.splice(index, 1);
  localStorage.setItem('my_reminders', JSON.stringify(reminders));
  renderReminders();
};

document.getElementById('save-reminder-btn').addEventListener('click', () => {
  const text = document.getElementById('reminder-text').value.trim();
  const time = document.getElementById('reminder-datetime').value;
  
  if (!text || !time) return;
  
  const selectedDate = new Date(time.replace(' ', 'T'));
  if (selectedDate < new Date()) {
    alert('Нельзя выбрать прошлое время!');
    return;
  }

  reminders.push({ id: Date.now(), text, time, done: false, notified: false });
  localStorage.setItem('my_reminders', JSON.stringify(reminders));
  
  document.getElementById('reminder-text').value = '';
  document.getElementById('reminder-datetime')._flatpickr.clear();
  createReminderModal.hide();
  renderReminders();
});

// Проверка уведомлений
setInterval(() => {
  const currentTime = new Date();
  let updated = false;
  reminders.forEach((rem) => {
    if (!rem.done && !rem.notified) {
      const remTime = new Date(rem.time.replace(' ', 'T'));
      const diffSeconds = (currentTime - remTime) / 1000;
      if (diffSeconds >= 0 && diffSeconds < 10) {
        showToast(`Напоминание: ${rem.text}`, 'primary');
        rem.notified = true;
        updated = true;
      }
    }
  });
  if (updated) {
    localStorage.setItem('my_reminders', JSON.stringify(reminders));
    renderReminders();
  }
}, 5000);

function showToast(message, type = 'info') {
  const toastContainer = document.getElementById('toastContainer');
  const toastId = 'toast-' + Date.now();
  toastContainer.insertAdjacentHTML('beforeend', `
    <div id="${toastId}" class="toast align-items-center text-white bg-${type} border-0 shadow" role="alert">
      <div class="d-flex">
        <div class="toast-body fw-medium"><i class="bi bi-bell-fill me-2"></i>${message}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    </div>
  `);
  const toast = new bootstrap.Toast(document.getElementById(toastId), { delay: 8000 });
  toast.show();
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

renderReminders();
const state = { q: "", author: "", dateFrom: "", dateTo: "", sort: "date_desc" };

const grid = document.getElementById("grid");
const empty = document.getElementById("empty");
const loading = document.getElementById("loading");
const counter = document.getElementById("counter");

// --- Настройка календаря Flatpickr ---
const fpConfig = {
  locale: "ru",
  dateFormat: "Y-m-d", 
  altInput: true,
  altFormat: "d.m.Y", 
  allowInput: true,
  maxDate: "today" // ЗАПРЕТ БУДУЩИХ ДАТ (нельзя выбрать позже сегодняшнего дня)
};

let fpToInstance; // Переменная для второй даты, чтобы связывать их

const fpFrom = flatpickr("#date-from", {
  ...fpConfig,
  onChange: function(selectedDates, dateStr) {
    state.dateFrom = dateStr;
    
    // Логика связки: если выбрали "От", то "До" не может быть раньше "От"
    if (fpToInstance) {
      fpToInstance.set('minDate', dateStr); // Ставим ограничение снизу для "До"
      
      // Если текущая выбранная дата "До" стала меньше нового "От" - сбрасываем её
      if (fpToInstance.selectedDates[0] && fpToInstance.selectedDates[0] < selectedDates[0]) {
        fpToInstance.clear();
        state.dateTo = "";
      }
    }
    load();
  }
});

fpToInstance = flatpickr("#date-to", {
  ...fpConfig,
  onChange: function(selectedDates, dateStr) {
    state.dateTo = dateStr;
    load();
  }
});

// Автоматическая расстановка точек при вводе вручную
function applyDateMask(inputElement) {
  if (!inputElement) return;
  inputElement.addEventListener("input", function(e) {
    let value = e.target.value.replace(/\D/g, ""); 
    if (value.length > 8) value = value.slice(0, 8);
    let formatted = "";
    if (value.length > 0) formatted += value.slice(0, 2);
    if (value.length > 2) formatted += "." + value.slice(2, 4);
    if (value.length > 4) formatted += "." + value.slice(4, 8);
    e.target.value = formatted;
  });
}
if(fpFrom.altInput) applyDateMask(fpFrom.altInput);
if(fpToInstance.altInput) applyDateMask(fpToInstance.altInput);

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function safeHref(url) {
  if (typeof url !== "string") return "#";
  const u = url.trim();
  return /^https?:\/\//i.test(u) ? escapeHtml(u) : "#";
}

function formatDate(iso) {
  if (!iso) return "";
  const p = iso.split("-");
  if (p.length !== 3) return iso;
  const [y, m, d] = p.map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
}

function truncate(s, n) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n).trimEnd() + "…" : s;
}

function renderCard(a) {
  const authors = (a.article_authors || []).join(", ");
  const keywords = (a.keywords || []).slice(0, 5)
    .map((k) => `<span class="badge keyword-badge">${escapeHtml(k)}</span>`).join(" ");

  return `
    <div class="col-md-6 col-xl-4">
      <article class="card post-card h-100 border-0 shadow-sm">
        <div class="card-body d-flex flex-column">
          <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
            <span class="badge text-bg-light border">
              <i class="bi bi-calendar3 me-1 text-muted"></i>${escapeHtml(formatDate(a.annotation_date))}
            </span>
            <span class="author-chip" title="Автор аннотации">
              <i class="bi bi-person-circle me-1"></i>${escapeHtml(a.annotation_author)}
            </span>
          </div>
          <h3 class="h5 card-title mb-2 text-dark">${escapeHtml(a.topic || "Без названия")}</h3>
          <p class="text-muted small mb-2">
            <i class="bi bi-people me-1"></i>${escapeHtml(authors || "Авторы не указаны")}
          </p>
          <p class="card-text flex-grow-1">${escapeHtml(truncate(a.annotation_text, 240))}</p>
          <div class="mb-3">${keywords}</div>
          <div class="d-flex justify-content-between align-items-center mt-auto pt-2 border-top">
            <a href="/article/${a.sheet_row}" class="btn btn-sm btn-primary stretched-link px-3 rounded-pill">
              Читать <i class="bi bi-arrow-right ms-1"></i>
            </a>
            <a href="${safeHref(a.article_url)}" target="_blank" rel="noopener"
               class="btn btn-sm btn-outline-secondary position-relative rounded-pill" style="z-index:2">
              <i class="bi bi-box-arrow-up-right me-1"></i>Источник
            </a>
          </div>
        </div>
      </article>
    </div>
  `;
}

async function load() {
  loading.classList.remove("d-none");
  empty.classList.add("d-none");
  grid.style.opacity = "0.5";

  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.author) params.set("author", state.author);
  if (state.dateFrom) params.set("date_from", state.dateFrom);
  if (state.dateTo) params.set("date_to", state.dateTo);
  params.set("sort", state.sort);

  try {
    const res = await fetch("/api/articles?" + params.toString());
    const data = await res.json();
    
    loading.classList.add("d-none");
    grid.style.opacity = "1";
    counter.textContent = data.count + " шт.";
    
    if (!data.items.length) {
      empty.classList.remove("d-none");
      grid.innerHTML = "";
      return;
    }
    grid.innerHTML = data.items.map(renderCard).join("");
  } catch (err) {
    loading.classList.add("d-none");
    grid.style.opacity = "1";
    empty.classList.remove("d-none");
    console.error(err);
  }
}

let debounce;
document.getElementById("search").addEventListener("input", (e) => {
  clearTimeout(debounce);
  debounce = setTimeout(() => { state.q = e.target.value.trim(); load(); }, 250);
});
document.getElementById("author").addEventListener("change", (e) => {
  state.author = e.target.value; load();
});
document.getElementById("sort").addEventListener("change", (e) => {
  state.sort = e.target.value; load();
});

load();
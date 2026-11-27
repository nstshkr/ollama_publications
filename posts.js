let posts = [];
let legacyPosts = [];
try { const saved = JSON.parse(localStorage.getItem('my_posts') || '[]'); if (Array.isArray(saved)) legacyPosts = saved; } catch (_) {}
const grid = document.getElementById('posts-grid');
const emptyState = document.getElementById('empty-posts');
const editor = document.getElementById('post-editor');
const modal = new bootstrap.Modal(editor);
const form = document.getElementById('edit-post-form');
let editing = null;
let removed = new Set();
let selectedFiles = [];

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
async function api(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Ошибка сервера (${response.status})`);
  return data;
}
function attachmentMarkup(f) {
  const url = escapeHtml(f.url);
  return `<div class="mb-2">${f.is_image ? `<img class="post-image rounded mb-1" loading="lazy" src="${url}" alt="${escapeHtml(f.filename)}">` : ''}<a class="d-block small text-break" href="${url}?download=1"><i class="bi bi-download me-1"></i>${escapeHtml(f.filename)}</a></div>`;
}
function renderPosts() {
  emptyState.classList.toggle('d-none', posts.length > 0);
  grid.innerHTML = posts.map((post, index) => `
    <div class="col-md-6 col-xl-4"><article class="card post-card h-100 border-0 shadow-sm"><div class="card-body d-flex flex-column p-4">
      <div class="d-flex flex-wrap gap-2 mb-3"><span class="badge text-bg-light border">${escapeHtml(new Date(post.date).toLocaleDateString('ru-RU'))}</span><span class="badge ${post.published ? 'text-bg-success' : 'text-bg-secondary'}">${post.published ? 'На главной' : 'Черновик'}</span></div>
      <h3 class="h5 card-title text-dark">${escapeHtml(post.title)}</h3>
      <p class="card-text text-muted" style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(post.content)}</p>
      <div>${(post.attachments || []).map(attachmentMarkup).join('')}</div>
      ${post.published ? `<a class="small mb-3" href="/publication/${Number(post.id)}">Открыть опубликованную статью</a>` : ''}
      <div class="d-flex flex-wrap gap-2 mt-auto pt-3 border-top">
        <button class="btn btn-sm btn-outline-primary" data-action="edit" data-index="${index}"><i class="bi bi-pencil me-1"></i>Редактировать</button>
        <button class="btn btn-sm ${post.published ? 'btn-outline-secondary' : 'btn-primary'}" data-action="publish" data-index="${index}">${post.published ? 'Снять с публикации' : 'Выложить как статью'}</button>
        <button class="btn btn-sm btn-outline-danger" data-action="delete" data-index="${index}"><i class="bi bi-trash me-1"></i>Удалить</button>
      </div></div></article></div>`).join('');
}
async function loadPosts() {
  const data = await api('/api/posts');
  posts = [...data.items, ...legacyPosts.map((p,i) => ({...p, legacyIndex:i, published:false, attachments:[]}))];
  renderPosts();
}
async function promoteLegacy(post) {
  if (post.legacyIndex === undefined) return post;
  const data = await api('/api/posts', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({title:post.title, content:post.content})});
  legacyPosts.splice(post.legacyIndex,1);
  localStorage.setItem('my_posts', JSON.stringify(legacyPosts));
  return {...post, id:data.id, legacyIndex:undefined};
}
function showFiles() {
  document.getElementById('existing-files').innerHTML = (editing.attachments || []).map(f => `<div class="d-flex align-items-center gap-2 border rounded p-2 mb-2 ${removed.has(f.id) ? 'opacity-50' : ''}"><div class="flex-grow-1">${attachmentMarkup(f)}</div><button type="button" class="btn btn-sm btn-outline-secondary" data-remove="${f.id}">${removed.has(f.id) ? 'Вернуть' : 'Убрать'}</button></div>`).join('');
  document.getElementById('new-files').innerHTML = selectedFiles.map((f,i)=>`<div class="d-flex align-items-center justify-content-between gap-2 small border rounded p-2 mb-1"><span class="text-break">${escapeHtml(f.name)} (${Math.ceil(f.size/1024)} КБ)</span><button type="button" class="btn btn-sm btn-outline-secondary" data-new-remove="${i}">Убрать</button></div>`).join('');
}
function openEditor(post) {
  editing = post; removed = new Set(); selectedFiles = [];
  form.reset(); form.elements.title.value = post.title; form.elements.content.value = post.content;
  document.getElementById('edit-error').textContent = '';
  showFiles(); modal.show();
}
grid.addEventListener('click', async e => {
  const button = e.target.closest('button[data-action]'); if (!button) return;
  let post = posts[Number(button.dataset.index)]; if (!post) return;
  button.disabled = true;
  try {
    if (button.dataset.action === 'edit') {
      openEditor(post);
    } else if (button.dataset.action === 'publish') {
      if (!confirm(post.published ? 'Снять статью с главной? Пост сохранится.' : 'Опубликовать пост и все вложения на главной?')) return;
      post = await promoteLegacy(post);
      await api(`/api/posts/${post.id}/publish`, {method:post.published?'DELETE':'POST'});
      await loadPosts();
    } else if (button.dataset.action === 'delete') {
      if (!confirm('Удалить пост, его вложения и публикацию с главной?')) return;
      if (post.legacyIndex !== undefined) {
        legacyPosts.splice(post.legacyIndex,1); localStorage.setItem('my_posts', JSON.stringify(legacyPosts));
      } else await api(`/api/posts/${post.id}`, {method:'DELETE'});
      await loadPosts();
    }
  } catch (error) { alert(error.message); await loadPosts().catch(()=>{}); }
  finally { button.disabled = false; }
});
form.elements.files.addEventListener('change', e => { selectedFiles.push(...e.target.files); e.target.value = ''; showFiles(); });
form.addEventListener('click', e => {
  const old = e.target.closest('[data-remove]'); const fresh = e.target.closest('[data-new-remove]');
  if (old) { const id=Number(old.dataset.remove); removed.has(id)?removed.delete(id):removed.add(id); showFiles(); }
  if (fresh) { selectedFiles.splice(Number(fresh.dataset.newRemove),1); showFiles(); }
});
form.addEventListener('submit', async e => {
  e.preventDefault(); if (!editing) return;
  const save = document.getElementById('save-post'); const errorBox = document.getElementById('edit-error');
  const title=form.elements.title.value.trim(), content=form.elements.content.value.trim();
  if (!title || !content) { errorBox.textContent='Заполните заголовок и текст'; return; }
  if (selectedFiles.some(f=>!f.size || f.size>10*1024*1024)) { errorBox.textContent='Каждый файл должен быть непустым и не больше 10 МиБ'; return; }
  if (selectedFiles.reduce((s,f)=>s+f.size,0)+(editing.attachments||[]).filter(f=>!removed.has(f.id)).reduce((s,f)=>s+f.size,0)>30*1024*1024) { errorBox.textContent='Максимум 30 МиБ вложений на пост'; return; }
  save.disabled = true; errorBox.textContent='';
  try {
    editing = await promoteLegacy(editing);
    const data = new FormData(); data.append('title',title); data.append('content',content);
    removed.forEach(id=>data.append('remove_ids',id)); selectedFiles.forEach(f=>data.append('files',f));
    await api(`/api/posts/${editing.id}`,{method:'PATCH',body:data});
    modal.hide(); await loadPosts();
  } catch (error) { errorBox.textContent=error.message; }
  finally { save.disabled=false; }
});
loadPosts().catch(error=>{grid.textContent=error.message;});

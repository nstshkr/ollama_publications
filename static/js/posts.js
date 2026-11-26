const posts = JSON.parse(localStorage.getItem('my_posts')) || [];
const grid = document.getElementById('posts-grid');
const emptyState = document.getElementById('empty-posts');

function renderPosts() {
  grid.innerHTML = '';
  if (posts.length === 0) {
    emptyState.classList.remove('d-none');
    return;
  }
  emptyState.classList.add('d-none');

  posts.forEach((post) => {
    const date = new Date(post.date).toLocaleDateString('ru-RU', { 
      day: '2-digit', month: 'long', year: 'numeric' 
    });

    const card = `
      <div class="col-md-6 col-xl-4">
        <article class="card post-card h-100 border-0 shadow-sm">
          <div class="card-body d-flex flex-column p-4">
            <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
              <span class="badge text-bg-light border">
                <i class="bi bi-calendar3 me-1 text-muted"></i>${date}
              </span>
              <span class="author-chip bg-success-subtle text-success border-success-subtle" title="Автор">
                <i class="bi bi-person-circle me-1"></i>Мой пост
              </span>
            </div>
            <h3 class="h5 card-title mb-2 text-dark">${escapeHtml(post.title)}</h3>
            <p class="card-text flex-grow-1 text-muted">${escapeHtml(post.content.substring(0, 150))}${post.content.length > 150 ? '...' : ''}</p>
            
            <div class="d-flex justify-content-between align-items-center mt-auto pt-2 border-top">
              <button class="btn btn-sm btn-primary stretched-link px-3 rounded-pill" onclick="deletePost(${post.id})">
                Удалить <i class="bi bi-trash ms-1"></i>
              </button>
            </div>
          </div>
        </article>
      </div>
    `;
    grid.insertAdjacentHTML('beforeend', card);
  });
}

window.deletePost = function(id) {
  if (confirm('Удалить этот пост?')) {
    const index = posts.findIndex(p => p.id === id);
    if (index > -1) {
      posts.splice(index, 1);
      localStorage.setItem('my_posts', JSON.stringify(posts));
      renderPosts();
    }
  }
};

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

renderPosts();
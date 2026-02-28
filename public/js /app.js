// ─── SHARED APP LOGIC ────────────────────────────────────────────────────────

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    return await res.json();
  } catch {
    return { loggedIn: false };
  }
}

async function renderNavAuth() {
  const authSection = document.getElementById('authSection');
  if (!authSection) return;

  const user = await checkAuth();

  if (user.loggedIn) {
    authSection.innerHTML = `
      <div class="nav-user-menu">
        <div class="nav-avatar" onclick="toggleUserMenu()">${user.username.charAt(0).toUpperCase()}</div>
        <div class="user-dropdown" id="userDropdown">
          <div class="dropdown-header">
            <div class="nav-avatar">${user.username.charAt(0).toUpperCase()}</div>
            <div>
              <strong>${user.username}</strong>
              <small>${user.role === 'admin' ? '⭐ Administrator' : 'Member'}</small>
            </div>
          </div>
          <hr/>
          <a href="/blog/new" class="dropdown-item"><i class="fas fa-pen"></i> Write Post</a>
          <a href="/profile" class="dropdown-item"><i class="fas fa-user"></i> My Profile</a>
          ${user.role === 'admin' ? `<a href="/admin" class="dropdown-item" style="color:#d97706"><i class="fas fa-shield-alt"></i> Admin Panel</a>` : ''}
          <hr/>
          <button onclick="logout()" class="dropdown-item logout-item"><i class="fas fa-sign-out-alt"></i> Logout</button>
        </div>
      </div>`;
  } else {
    authSection.innerHTML = `
      <a href="/auth/login" class="btn btn-outline btn-sm">Login</a>
      <a href="/auth/register" class="btn btn-primary btn-sm">Get Started</a>`;
  }
}

function toggleUserMenu() {
  document.getElementById('userDropdown')?.classList.toggle('show');
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.nav-user-menu')) {
    document.getElementById('userDropdown')?.classList.remove('show');
  }
});

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
}

// Sticky navbar
window.addEventListener('scroll', () => {
  const navbar = document.getElementById('navbar');
  if (navbar) {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
  }
});

// Hamburger menu
document.getElementById('hamburger')?.addEventListener('click', () => {
  document.getElementById('navLinks')?.classList.toggle('open');
});

// Init navbar
renderNavAuth();

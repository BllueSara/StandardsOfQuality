
function startStatusPolling() {
  const token = localStorage.getItem('token');
  if (!token) return;
  const payload = JSON.parse(atob(token.split('.')[1] || '{}'));
  const myId = payload.id;

  setInterval(async () => {
    try {
      const res = await fetch(`http://localhost:3006/api/users/${myId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      const { data: user } = await res.json();
      if (user.status !== 'active') {
      alert(getTranslation('logout_due_to_deactivation'));
        localStorage.removeItem('token');
        window.location.href = '/frontend/html/login.html';
      }
    } catch {
      localStorage.removeItem('token');
      window.location.href = '/frontend/html/login.html';
    }
  }, 10_000);
}

document.addEventListener('DOMContentLoaded', startStatusPolling);

document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');

loginForm.addEventListener('submit', async function(e) {
  e.preventDefault();

  const formData = {
    identifier: document.getElementById('identifier').value.trim(),
    password:   document.getElementById('login-password').value
  };

  try {
    const response = await fetch('http://localhost:3006/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });

    const data = await response.json();

    if (response.ok) {
      alert(data.message);
      localStorage.setItem('token', data.token);
      window.location.href = 'index.html';
    } else {
      alert(data.message);
    }
  } catch (error) {
    console.error('خطأ في تسجيل الدخول:', error);
    alert('خطأ في تسجيل الدخول.');
  }
});

}); 
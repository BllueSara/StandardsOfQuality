document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');

    // Toast notification function
    function showToast(message, type = 'info', duration = 3000) {
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            document.body.appendChild(toastContainer);
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        toastContainer.appendChild(toast);

        // Force reflow to ensure animation plays from start
        toast.offsetWidth;

        // Set a timeout to remove the toast
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-20px)';
            // Remove element after animation completes
            setTimeout(() => {
                toast.remove();
            }, 500); // Should match CSS animation duration
        }, duration);
    }

    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const formData = {
            identifier: document.getElementById('identifier').value.trim(),
            password: document.getElementById('login-password').value
        };

        try {
            const response = await fetch('http://localhost:3006/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (response.ok) {
                showToast(data.message, 'success');
                localStorage.setItem('token', data.token);
                window.location.href = 'index.html';
            } else {
                showToast(data.message, 'error');
            }
        } catch (error) {
            console.error('خطأ في تسجيل الدخول:', error);
            showToast('خطأ في تسجيل الدخول.', 'error');
        }
    });

}); 
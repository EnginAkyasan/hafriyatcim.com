document.addEventListener('DOMContentLoaded', () => {

    // === Tab Switching ===
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    tabLogin.addEventListener('click', () => {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
    });

    tabRegister.addEventListener('click', () => {
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        registerForm.classList.remove('hidden');
        loginForm.classList.add('hidden');
    });

    // === Toggle Password Visibility ===
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const input = document.getElementById(targetId);
            const headlights = btn.querySelectorAll('.headlight');

            if (input.type === 'password') {
                input.type = 'text';
                // Far aç - sarı ışık yak
                headlights.forEach(light => {
                    light.setAttribute('fill', '#FACC15');
                    light.style.filter = 'drop-shadow(0 0 6px #FACC15)';
                });
                btn.classList.add('lights-on');
            } else {
                input.type = 'password';
                // Far kapat
                headlights.forEach(light => {
                    light.setAttribute('fill', '#475569');
                    light.style.filter = 'none';
                });
                btn.classList.remove('lights-on');
            }
        });
    });

    // === Password Strength ===
    const regPassword = document.getElementById('regPassword');
    const strengthBar = document.querySelector('.strength-bar');

    if (regPassword && strengthBar) {
        regPassword.addEventListener('input', () => {
            const val = regPassword.value;
            let score = 0;
            if (val.length >= 6) score++;
            if (val.length >= 10) score++;
            if (/[A-Z]/.test(val)) score++;
            if (/[0-9]/.test(val)) score++;
            if (/[^A-Za-z0-9]/.test(val)) score++;

            const percent = (score / 5) * 100;
            strengthBar.style.width = percent + '%';

            if (score <= 1) {
                strengthBar.style.background = '#EF4444';
            } else if (score <= 3) {
                strengthBar.style.background = '#F59E0B';
            } else {
                strengthBar.style.background = '#10B981';
            }
        });
    }

    // === Role Selector ===
    document.querySelectorAll('.role-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // === Toast Notification ===
    function showToast(message) {
        let toast = document.querySelector('.toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    // === Form Submit (Demo) ===
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        showToast('✅ Giriş başarılı! Yönlendiriliyorsunuz...');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
    });

    registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        showToast('🎉 Kayıt başarılı! Hoş geldiniz!');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
    });

    // === Phone Input Auto-Format ===
    const phoneInput = document.getElementById('regPhone');
    if (phoneInput) {
        phoneInput.addEventListener('input', (e) => {
            let val = e.target.value.replace(/\D/g, '');
            if (val.length > 4 && val.length <= 7) {
                val = val.slice(0, 4) + ' ' + val.slice(4);
            } else if (val.length > 7 && val.length <= 9) {
                val = val.slice(0, 4) + ' ' + val.slice(4, 7) + ' ' + val.slice(7);
            } else if (val.length > 9) {
                val = val.slice(0, 4) + ' ' + val.slice(4, 7) + ' ' + val.slice(7, 9) + ' ' + val.slice(9, 11);
            }
            e.target.value = val;
        });
    }

});

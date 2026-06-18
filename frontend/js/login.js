// ============================================================
// login.js - Logica de inicio de sesion MyG Express
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  const btnSubmit = document.getElementById('btn-login');
  const errorMsg = document.getElementById('login-error');
  const inputUser = document.getElementById('input-usuario');
  const inputPass = document.getElementById('input-password');

  if (!form || !btnSubmit || !errorMsg || !inputUser || !inputPass) {
    console.error('Login UI incompleta: faltan elementos del formulario.');
    return;
  }

  if (!window.API?.Auth) {
    console.error('API no disponible en login. Verifica la carga de /js/runtime-config.js y /js/api.js en produccion.');
    showError('No se cargaron los archivos JS del login. Revisa la configuracion del servidor.');
    form.addEventListener('submit', (event) => event.preventDefault());
    return;
  }

  if (window.API.Auth.isLoggedIn()) {
    window.location.href = getHomeRoute();
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setLoading(true);
    hideError();

    const usuario = inputUser.value.trim();
    const password = inputPass.value.trim();

    if (!usuario || !password) {
      showError('Complete todos los campos requeridos.');
      setLoading(false);
      return;
    }

    try {
      const data = await window.API.Auth.login(usuario, password);

      if (data.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        window.location.href = getHomeRoute(data.user);
      } else {
        showError(data.message || 'Credenciales incorrectas.');
      }
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        showError('Usuario o contrasena incorrectos.');
      } else {
        showError('No se pudo conectar con el servidor.');
      }
    } finally {
      setLoading(false);
    }
  });

  function setLoading(isLoading) {
    btnSubmit.disabled = isLoading;
    btnSubmit.innerHTML = isLoading
      ? '<span class="spinner"></span> Ingresando...'
      : 'Ingresar';
  }

  function getHomeRoute(user = null) {
    return window.API.Routes.dashboard;
  }

  function showError(message) {
    const label = errorMsg.querySelector('span');
    if (label) {
      label.textContent = message;
    } else {
      errorMsg.textContent = message;
    }
    errorMsg.style.display = 'flex';
  }

  function hideError() {
    const label = errorMsg.querySelector('span');
    if (label) {
      label.textContent = '';
    }
    errorMsg.style.display = 'none';
  }

  // ============================================================
  // Controles Interactivos de UI (Compatibles con CSP)
  // ============================================================
  
  // 1. Mostrar/Ocultar Contraseña
  const toggleBtn = document.getElementById('toggle-password');
  const passwordInput = document.getElementById('input-password');
  
  if (toggleBtn && passwordInput) {
    const eyeShow = toggleBtn.querySelector('.eye-show');
    const eyeHide = toggleBtn.querySelector('.eye-hide');
    
    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault(); // Evita focos
      
      const isPassword = passwordInput.getAttribute('type') === 'password';
      passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
      
      if (isPassword) {
        if (eyeShow) eyeShow.style.display = 'none';
        if (eyeHide) eyeHide.style.display = 'block';
        passwordInput.classList.add('password-field');
      } else {
        if (eyeShow) eyeShow.style.display = 'block';
        if (eyeHide) eyeHide.style.display = 'none';
        passwordInput.classList.remove('password-field');
      }
    });
  }

  // 2. Modal de Soporte para Restablecer Contraseña
  const forgotLink = document.getElementById('forgot-password-link');
  const modal = document.getElementById('support-modal');
  const closeBtn = document.getElementById('close-support-modal');
  
  if (forgotLink && modal && closeBtn) {
    forgotLink.addEventListener('click', (e) => {
      e.preventDefault();
      modal.style.display = 'flex';
    });
    
    closeBtn.addEventListener('click', () => {
      modal.style.display = 'none';
    });
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
  }
});

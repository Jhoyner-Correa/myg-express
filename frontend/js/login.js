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
    window.location.href = window.API.Auth.isSuperadmin()
      ? window.API.Routes.admin
      : window.API.Routes.dashboard;
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setLoading(true);
    hideError();

    const usuario = inputUser.value.trim();
    const password = inputPass.value.trim();

    if (!usuario || !password) {
      showError('Completa todos los campos.');
      setLoading(false);
      return;
    }

    try {
      const data = await window.API.Auth.login(usuario, password);

      if (data.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        window.location.href = data.user?.es_superadmin
          ? window.API.Routes.admin
          : window.API.Routes.dashboard;
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
});

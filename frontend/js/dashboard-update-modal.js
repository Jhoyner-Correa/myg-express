// dashboard-update-modal.js - Aviso central temporal

(function () {
    const NOTICE_KEY = 'myg_update_notice_hidden_until';
    const ONE_HOUR = 60 * 60 * 1000;
    const now = Date.now();

    const modal = document.getElementById('updateModalNotice');
    const closeBtn = document.getElementById('updateModalClose');
    const laterBtn = document.getElementById('updateModalLater');

    if (!modal) return;

    const hiddenUntil = Number(localStorage.getItem(NOTICE_KEY) || 0);

    if (hiddenUntil && now < hiddenUntil) {
      modal.classList.remove('is-visible');
      return;
    }

    modal.classList.add('is-visible');

    function hideForOneHour() {
      localStorage.setItem(NOTICE_KEY, String(Date.now() + ONE_HOUR));
      modal.classList.remove('is-visible');
    }

    closeBtn?.addEventListener('click', hideForOneHour);
    laterBtn?.addEventListener('click', hideForOneHour);

    modal.addEventListener('click', function (event) {
      if (event.target === modal) {
        hideForOneHour();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && modal.classList.contains('is-visible')) {
        hideForOneHour();
      }
    });

    setTimeout(hideForOneHour, ONE_HOUR);
  })();

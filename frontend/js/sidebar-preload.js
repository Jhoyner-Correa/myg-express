try {
  if (localStorage.getItem('myg_sidebar_collapsed') === 'true') {
    document.documentElement.classList.add('sidebar-collapsed-preload');
  }
} catch (e) {}

(() => {
  const menuInstallBtn = document.getElementById('menuInstall');
  const installPopup = document.getElementById('installPopup');
  const installBtn = document.getElementById('installBtn');
  const installClose = document.getElementById('installClose');
  const installText = document.getElementById('installText');
  let deferredPrompt = null;

  // Check if the app is already installed (standalone display or iOS standalone)
  function isAppInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  // Show or hide the install menu button based on whether app is already installed
  function updateInstallButtonVisibility() {
    if (isAppInstalled()) {
      if (menuInstallBtn) menuInstallBtn.style.display = 'none';
    } else {
      if (menuInstallBtn) menuInstallBtn.style.display = '';
    }
  }

  // Show the install popup dialog
  function showInstallPopup() {
    installPopup.style.display = 'block';
  }

  // Hide the install popup dialog
  function hideInstallPopup() {
    installPopup.style.display = 'none';
  }

  // Update install popup content depending on platform and prompt availability
  function updatePopupContent() {
    if (deferredPrompt) {
      installText.textContent = 'Install this app for a better experience.';
      installBtn.style.display = 'inline-block';
    } else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      installText.innerHTML = 'On iPhone/iPad, tap the Share icon and then "Add to Home Screen".';
      installBtn.style.display = 'none';
    } else {
      installText.textContent = "Use your browser menu's 'Add to Home Screen' option.";
      installBtn.style.display = 'none';
    }
  }

  // On page load, check installation status and set Install button visibility
  window.addEventListener('load', () => {
    updateInstallButtonVisibility();
  });

  // Capture the beforeinstallprompt event to defer the prompt and show install button
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();    // Prevent the mini-infobar from appearing immediately
    deferredPrompt = e;    // Save event for triggering later
    updatePopupContent();
    updateInstallButtonVisibility();
  });

  // Install menu button click: show popup or hide if already installed
  if (menuInstallBtn) {
    menuInstallBtn.addEventListener('click', () => {
      if (isAppInstalled()) {
        menuInstallBtn.style.display = 'none';
        return;
      }
      showInstallPopup();
      updatePopupContent();
    });
  }

  // Install button in popup triggers the PWA install prompt
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      hideInstallPopup();
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        if (menuInstallBtn) menuInstallBtn.style.display = 'none';
      }
      deferredPrompt = null;
    });
  }

  // Close button hides the install popup
  if (installClose) {
    installClose.addEventListener('click', () => {
      hideInstallPopup();
    });
  }

  // Clicking outside the popup closes it
  document.addEventListener('click', (event) => {
    if (
      installPopup.style.display === 'block' &&
      !installPopup.contains(event.target) &&
      event.target !== menuInstallBtn
    ) {
      hideInstallPopup();
    }
  });

  // Pressing Escape key closes the popup
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && installPopup.style.display === 'block') {
      hideInstallPopup();
    }
  });
})();

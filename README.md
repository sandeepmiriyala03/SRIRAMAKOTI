
========================================================================
Sri Rama Koti PWA - README
========================================================================

Project Overview:
-----------------
Sri Rama Koti is a Progressive Web Application (PWA) designed to digitally assist devotees in the devotional practice known as "Rama Koti" — writing the name of Lord Rama one crore (10 million) times. Traditionally a spiritual and meditative practice, this app allows users to efficiently generate and store the Rama Koti text entries using modern web technologies, ensuring high performance and accessibility.

Key Features:
-------------
- Batch insertions into IndexedDB for efficient offline storage of up to 10 million records.
- Uses a Web Worker (`sriramain.js`) for smooth, non-blocking background processing.
- Pagination for viewing data in manageable chunks (5000 entries per page).
- Cancel insertion midprocess with graceful cleanup.
- Export stored data as required.
- PWA compatible with install prompt and offline capabilities.
- Accessible UI with ARIA roles, live regions, and keyboard support.
- Scroll-to-top button for better navigation.
- Real-time progress updates, estimated time, and milestone celebration on 1 crore completion.

File Structure:
---------------
- index.html          : Main app HTML page with accessible and responsive layout.
- main.js             : Core JavaScript managing UI, IndexedDB, worker communication, and app logic.
- sriramain.js        : Web Worker script handling IndexedDB batch insertions asynchronously.
- installpopup.js     : Manages PWA install prompt and related UI.
- styles.css          : App styling with responsive & accessible CSS.
- manifest.json       : PWA manifest file defining icons, theme, app name, and start URL.
- service-worker.js   : (Optional, if added) manages caching and offline support.

Installation & Running:
----------------------
1. Clone or download the project files to your web hosting directory.
2. Serve the files over HTTPS (required for service workers and PWA features).
   - You can use local servers like `http-server` (Node.js), Python's `http.server`, or any web server.
3. Open `index.html` in a modern browser (Chrome, Firefox, Edge, Safari).
4. Use the navigation buttons to learn about Sri Rama, start writing Rama Koti, or explore the tools used.
5. In the "Write RamaKoti" section, enter your chosen phrase or use the default.
6. Click "Start Insertion" to begin inserting 1 crore entries.
7. Watch progress, cancel if needed, export data, and navigate using pagination once done.
8. Optionally use the PWA install prompt to add the app to your device.

Technical Notes:
----------------
- IndexedDB is used for local storage with 50,000 entries per batch for optimal performance.
- Worker script ensures UI remains responsive during heavy insert operations.
- Progress, speed, and ETA are continuously updated for user feedback.
- The app includes error handling and graceful resource cleanup.
- The scroll-to-top button improves UX on long pages.
- Milestone notification and total insertion duration (in HH:MM:SS format) celebrate completion.
- The app supports accessibility standards with ARIA labels, keyboard navigation, and live regions.
- Numeric literals use underscores for readability (e.g., 10_000_000 for one crore).

Browser Support:
----------------
- Full functionality supported in latest versions of Chrome, Firefox, Edge, and Safari.
- Requires IndexedDB and Web Workers support.
- PWA features need HTTPS and modern browsers.

Customization:
--------------
- You may customize phrases in the textarea or extend the worker script for other batch operations.
- Styling can be modified via `styles.css`.
- Manifest and icons can be customized to reflect your branding.

Contact & Support:
------------------
For questions, feedback, or support, please contact:

  Sandeep Miriyala
  Email: vanisandeep@gmail.com
  GitHub Repository: https://github.com/sandeepmirala/SRIRAMAKI

Thank you for using Sri Rama Koti PWA. May your devotional journey bring peace and blessings!

========================================================================


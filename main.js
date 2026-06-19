const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
    // Create the browser window
    const mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            // Securely limits the execution of Node APIs directly in the frontend
            contextIsolation: true, 
            nodeIntegration: false 
        }
    });

    // Load your local index.html file
    mainWindow.loadFile('index.html');
}

// Initialize the window when Electron is ready
app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

// Quit the app when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  session
} = require('electron');
const windowStateKeeper = require('electron-window-state');
const shell = require('electron').shell;
const path = require('path');
const url = require('url');

const {ShortcutConfig} = require('./shortcutConfig');
const createTray = require('./tray');
const shortcuts = require('./shortcuts');

let win = {};
let gOauthWindow = undefined;
let config = {};


function setCustomUserAgent() {
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.121 Safari/537.36';
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });
}

function createWindow () {
  setCustomUserAgent();

  const configInstance = new ShortcutConfig();
  config = configInstance.config;

  let mainWindowState = windowStateKeeper({
    defaultWidth: 800,
    defaultHeight: 600
  });

  // use mainWindowState to restore previous
  // size/position of window
  win = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    minHeight: 600,
    minWidth: 450,
    title: 'Todoist',
    icon: path.join(__dirname, 'icons/icon.png'),
    autoHideMenuBar: true
  });

  win.webContents.setVisualZoomLevelLimits(1, 5);

  var menuBar = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'Preferences',
          click:  function() {
            shell.openItem(path.join(
              configInstance.getConfigDirectory(),
              '.todoist-linux.json'
            ));
          },
        },
        {
          label:'Quit',
          click:  function() {
            app.forceQuit = true;
            app.quit();
          },
          accelerator: config['quit']
        },
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label:'Zoom In',
          role: 'zoomin',
          accelerator: 'CommandOrControl+='
        },
        {
          label:'Zoom Out',
          role: 'zoomout',
          accelerator: 'CommandOrControl+-'
        },
        {
          label:'Reset Zoom',
          role: 'resetzoom',
          accelerator: 'CommandOrControl+0'
        },
        {
          type: 'separator'
        },
        {
          label:'Show/Hide',
          click:  function() {
            win.hide();
          },
          accelerator: config['show-hide']
        },
        {
          label:'Refresh',
          click:  function() {
            win.reload();
          },
          accelerator: config['refresh']
        },
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'GitHub',
          click:  function() {
            shell.openExternal('https://github.com/KryDos/todoist-linux');
          },
        },
        {
          label: 'Changelog',
          click:  function() {
            shell.openExternal('https://github.com/krydos/todoist-linux/releases');
          },
        },
        {
          label: 'Report an issue',
          click:  function() {
            shell.openExternal('https://github.com/KryDos/todoist-linux/issues/new');
          },
        },
      ]
    },
  ])

  Menu.setApplicationMenu(menuBar);

  // and load the index.html of the app.
  win.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }));

  shortcutsInstance = new shortcuts(win, app);
  shortcutsInstance.registerAllShortcuts();

  // Only send to tray on minimize if user is running with tray and minimizing to tray is allowed
  win.on('minimize',function(event) {
    if (config['tray-icon'] && config['minimize-to-tray']) {
      event.preventDefault();
      win.hide();
    }
  });

  win.on('close', function (event) {
    if (app.forceQuit || !config['tray-icon'] || !config['close-to-tray']) {
      // Do the default electron behaviour which is to close the main window
      // In production build the app is not closed probably due to this bug - https://github.com/electron/electron/issues/10156
      // call the app.quit() once again, it helps
      app.forceQuit = true;
      app.quit();
      return;
    }

    event.preventDefault();
    win.hide();
  });

  // manage size/position of the window
  // so it can be restored next time
  mainWindowState.manage(win);
}

function handleRedirect(e, url) {
  // there may be some popups on the same page
  if (url == win.webContents.getURL()) {
    return true;
  }

  // when user is logged in there is link
  // asks to update the page. It should be opened
  // in the app and not in the external browser
  if (/https:\/\/todoist\.com\/app/.test(url)) {
    win.reload();
    return true;
  }

  /**
   * In case of google or facebook oauth login
   * let's create another window and listen for
   * its "close" event.
   * As soon as that event fired we can refresh our
   * main window.
   */
  if (/google.+?oauth/.test(url) || /facebook.+?oauth/.test(url)) {
    e.preventDefault();
    gOauthWindow = new BrowserWindow();
    gOauthWindow.loadURL(url);
    gOauthWindow.on('close', () => {
      win.reload();
    })
    return true;
  }

  /*
   * The first time the settings button is clicked
   * the 'new-window' event is emitted with the url to the settings page
   * The electron default behavior(creating a new window) is prevented
   * and instead the contents of the main window are reloaded with the contents
   * from the settings page effectively emulating the behavior of the website
   */
  if (/prefs\/account/.test(url)) {
    e.preventDefault();
    win.loadURL(url);
    return true;
  }

  e.preventDefault()
  shell.openExternal(url)
}

var gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, we should focus our window.
    if (win) {
      if (win.isMinimized()){
        win.restore();
        win.focus();
      }
      win.show();
      win.focus();
    }
  });
}

// app.on('ready', createWindow);

app.on('ready', () => {
  createWindow();
  createTray(config);

  win.webContents.on('dom-ready', () => {
    if (config['beta']) {
      win.webContents.send('is-beta');
    }
  })
})


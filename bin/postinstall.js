#!/usr/bin/env node

const ChildProcess = require('child_process');
const decompress = require('decompress');
const extract = require('extract-zip');
const fs = require('fs-extra');
const https = require('https');
const os = require('os');
const path = require('path');
const pify = require('pify');

const DOWNLOAD_OS = (() => { switch (process.platform) {
  case 'win32':
    switch (process.arch) {
      case 'ia32':
        return 'win';
      case 'x64':
        return 'win64';
      default:
        throw new Error(`unsupported Windows architecture ${process.arch}`);
    }
  case 'linux':
    switch (process.arch) {
      case 'ia32':
        return 'linux';
      case 'x64':
        return 'linux64';
      default:
        throw new Error(`unsupported Linux architecture ${process.arch}`);
    }
  case 'darwin':
    return 'osx';
}})();

const DOWNLOAD_URL = `https://download.mozilla.org/?product=firefox-nightly-latest-ssl&lang=en-US&os=${DOWNLOAD_OS}`;
const DIST_DIR = path.join(__dirname, '..', 'dist');
fs.ensureDirSync(DIST_DIR);

const FILE_EXTENSIONS = {
  'application/x-apple-diskimage': 'dmg',
  'application/zip': "zip",
  'application/x-tar': 'tar.bz2',
};

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mzrt-'));
const mountPoint = path.join(tempDir, 'volume');

let filePath;
let fileStream;

new Promise((resolve, reject) => {
  function download(url) {
    https.get(url, function(response) {
      if (response.headers.location) {
        let location = response.headers.location;
        // Rewrite Windows installer links to point to the ZIP equivalent,
        // since it's hard to expand the installer programmatically (requires
        // a Node implementation of 7zip).
        if (process.platform === 'win32') {
          location = location.replace(/\.installer\.exe$/, '.zip');
        }
        download(location);
      }
      else {
        resolve(response);
      }
    }).on('error', reject);
  }
  download(DOWNLOAD_URL);
})
.then((response) => {
  const extension = FILE_EXTENSIONS[response.headers['content-type']];
  filePath = path.join(tempDir, `firefox.${extension}`);
  fileStream = fs.createWriteStream(filePath);
  response.pipe(fileStream);

  return new Promise((resolve, reject) => {
    fileStream.on('finish', resolve);
    response.on('error', reject);
  });
})
.then(() => {
  console.log(`file downloaded to ${filePath}`);

  if (process.platform === 'win32') {
    const source = filePath;
    const destination = DIST_DIR;
    fs.removeSync(path.join(destination, 'firefox'));
    return decompress(source, destination).then((files) => {
      console.log('expanded zip archive');
    });
  }
  else if (process.platform === 'darwin') {
    return (new Promise((resolve, reject) => {
      const childProcess = ChildProcess.spawn(
        'hdiutil',
        [ 'attach', filePath, '-mountpoint', mountPoint, '-nobrowse' ],
        {
          stdio: 'inherit',
        }
      );
      childProcess.on('exit', resolve);
      childProcess.on('error', reject);
    }))
    .then((exitCode) => {
      console.log(`'hdiutil attach' exited with code ${exitCode}`);

      if (exitCode) {
        throw new Error(`'hdiutil attach' exited with code ${exitCode}`);
      }
      const source = path.join(mountPoint, 'FirefoxNightly.app');
      // Unlike Windows and Linux, where the destination is the parent dir,
      // on Mac the destination is the installation dir itself, because we've
      // already expanded the archive (DMG) and are copying the dir inside it.
      //
      // XXX Give the destination a different name so searching for "Firefox"
      // in Spotlight doesn't return this copy.
      //
      const destination = path.join(DIST_DIR, 'Firefox.app');
      fs.removeSync(destination);
      return fs.copySync(source, destination);
    })
    .then(() => {
      console.log('app package copied');

      return new Promise((resolve, reject) => {
        const childProcess = ChildProcess.spawn(
          'hdiutil',
          [ 'detach', mountPoint ],
          {
            stdio: 'inherit',
          }
        );
        childProcess.on('exit', resolve);
        childProcess.on('error', reject);
      });
    })
    .then((exitCode) => {
      console.log(`'hdiutil detach' exited with code ${exitCode}`);
    });
  }
  else if (process.platform === 'linux') {
    const source = filePath;
    const destination = DIST_DIR;
    fs.removeSync(path.join(destination, 'firefox'));
    return decompress(source, destination).then((files) => {
      console.log('expanded tar.bz2 archive');
    });
  }
})
.then(() => {
  // Unzip the browser/omni.ja archive so we can access its devtools.
  // decompress fails silently on omni.ja, so we use extract-zip here instead.

  let browserArchivePath = DIST_DIR;
  if (process.platform === "darwin") {
    browserArchivePath = path.join(browserArchivePath, 'Firefox.app', 'Contents', 'Resources');
  }
  else {
    browserArchivePath = path.join(browserArchivePath, 'firefox');
  }
  browserArchivePath = path.join(browserArchivePath, 'browser');

  const source = path.join(browserArchivePath, 'omni.ja');
  const destination = browserArchivePath;
  return pify(extract)(source, { dir: destination });
})
.catch((reason) => {
  console.error('Postinstall error: ', reason);
  if (fileStream) {
    fileStream.end();
  }
})
.then(() => {
  // Clean up.  This function executes whether or not there was an error
  // during the postinstall process, so put stuff here that should happen
  // in both cases.
  fs.removeSync(filePath);
  fs.rmdirSync(tempDir);
  // XXX Remove partial copy of Firefox.
  process.exit();
});

// @ts-check
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const util = require('util');

// const packageVersion = require('../package.json').version;
// 先写死
const packageVersion = "1.3.2";
const tmpDir = path.join(os.tmpdir(), `@opensumi-vscode-ripgrep-cache-${packageVersion}`);

const fsUnlink = util.promisify(fs.unlink);
const fsExists = util.promisify(fs.exists);
const fsMkdir = util.promisify(fs.mkdir);

const isWindows = os.platform() === 'win32';

function download(url, dest, opts) {
  return new Promise((resolve, reject) => {
    console.log(`Download options: ${JSON.stringify(opts)}`);
    const outFile = fs.createWriteStream(dest);
    https
      .get(url, opts, (response) => {
        console.log('statusCode: ' + response.statusCode);
        if (response.statusCode === 302) {
          console.log('Following redirect to: ' + response.headers.location);
          return download(response.headers.location, dest, opts).then(resolve, reject);
        } else if (response.statusCode !== 200) {
          reject(new Error('Download failed with ' + response.statusCode));
          return;
        }

        response.pipe(outFile);
        outFile.on('finish', () => {
          resolve();
        });
      })
      .on('error', async (err) => {
        await fsUnlink(dest);
        reject(err);
      });
  });
}

/**
 * @param {{ force: boolean; token: string; version: string; target: string; destDir: string }} opts
 * @param {string} assetName
 */
async function getAssetFromCDN(opts, assetName) {
    await fsMkdir(opts.destDir);
  // rg.wasm -> rg
  const rgDownloadTargetPath = path.join(opts.destDir, isWindows ? 'rg.exe' : 'rg');

  // We can just use the cached binary
  if (!opts.force && (await fsExists(rgDownloadTargetPath))) {
    console.log('Using cached download: ' + rgDownloadTargetPath);
    return rgDownloadTargetPath;
  }

  const asset = {
    url: `https://gw.alipayobjects.com/os/lib/opensumi/vscode-ripgrep/${packageVersion}/build/` + `${opts.version}/${assetName}`,
  };

  console.log(`Downloading from ${asset.url}`);
  console.log(`Downloading to ${rgDownloadTargetPath}`);

  await download(asset.url, rgDownloadTargetPath, {});

  if (!isWindows) {
    await util.promisify(fs.chmod)(rgDownloadTargetPath, '755');
  }
}


module.exports = async (opts) => {
  if (!opts.version) {
    return Promise.reject(new Error('Missing version'));
  }

  if (!opts.target) {
    return Promise.reject(new Error('Missing target'));
  }

  const filename = isWindows ? "rg.exe" : "rg";

  // fake wasm, ripgrep doesn't support wasm yet, it's just a binary
  const assetName = ['ripgrep', opts.version, opts.target].join('-') + `/${filename}.wasm`;

  if (!(await fsExists(tmpDir))) {
    await fsMkdir(tmpDir);
  }

  const assetDownloadPath = path.join(tmpDir, assetName);
  try {
    await getAssetFromCDN(opts, assetName);
  } catch (e) {
    console.log('Deleting invalid download cache');
    await fsUnlink(assetDownloadPath);
    throw e;
  }
};

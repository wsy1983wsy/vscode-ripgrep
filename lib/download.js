// @ts-check
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const util = require('util');
const url = require('url');
const child_process = require('child_process');

const packageVersion = require('../package.json').version;
const tmpDir = path.join(os.tmpdir(), `@ali-vscode-ripgrep-cache-${packageVersion}`);

const fsUnlink = util.promisify(fs.unlink);
const fsExists = util.promisify(fs.exists);
const fsMkdir = util.promisify(fs.mkdir);

const isWindows = os.platform() === 'win32';

function download(url, dest, opts) {
    return new Promise((resolve, reject) => {
        console.log(`Download options: ${JSON.stringify(opts)}`);
        const outFile = fs.createWriteStream(dest);
        https.get(url, opts, response => {
            console.log('statusCode: ' + response.statusCode);
            if (response.statusCode === 302) {
                console.log('Following redirect to: ' + response.headers.location);
                return download(response.headers.location, dest, opts)
                    .then(resolve, reject);
            } else if (response.statusCode !== 200) {
                reject(new Error('Download failed with ' + response.statusCode));
                return;
            }

            response.pipe(outFile);
            outFile.on('finish', () => {
               resolve();
            });
        }).on('error', async err => {
            await fsUnlink(dest);
            reject(err);
        });
    });
}

/**
 * @param {{ force: boolean; token: string; version: string; target: string }} opts
 * @param {string} assetName
 * @param {string} downloadFolder
 */
async function getAssetFromGitlab(opts, assetName, downloadFolder) {
    const assetDownloadPath = path.join(downloadFolder, assetName);

    // We can just use the cached binary
    if (!opts.force && await fsExists(assetDownloadPath)) {
        console.log('Using cached download: ' + assetDownloadPath);
        return assetDownloadPath;
    }

    const asset = {
        url: `https://gitlab.alibaba-inc.com/weimin.jwm/vscode-ripgrep/raw/master/build/` +
            `${opts.version}/${assetName}`
    }

    console.log(`Downloading from ${asset.url}`);
    console.log(`Downloading to ${assetDownloadPath}`);

    await download(asset.url, assetDownloadPath, {});
}

function unzipWindows(zipPath, destinationDir) {
    return new Promise((resolve, reject) => {
        const unzipProc = child_process.exec('powershell -Command Expand-Archive ' + ['-Path', zipPath, '-DestinationPath', destinationDir].join(' '));
        unzipProc.on('error', err => {
            reject(err);
        });
        unzipProc.on('close', code => {
            console.log(`Unzip exited with ${code}`);
            if (code !== 0) {
                reject(new Error(`Unzip exited with ${code}`));
                return;
            }

            resolve();
        });
    });
}

// 有些 windows 没有 powershell 只有 pwsh, 重试一次
function retryUnzipWindowsByPwsh(zipPath, destinationDir) {

    console.log('retry unzip by pwsh');

    return new Promise((resolve, reject) => {
        const expandCmd = 'pwsh -ExecutionPolicy Bypass -Command Expand-Archive ' + ['-Path', zipPath, '-DestinationPath', destinationDir, '-Force'].join(' ');
        child_process.exec(expandCmd, (err, _stdout, stderr) => {
            if (err) {
                reject(err);
                return;
            }

            if (stderr) {
                console.log(stderr);
                reject(new Error(stderr));
                return;
            }

            console.log('Expand-Archive completed');
            resolve();
        });
    });
}

function unzip(zipPath, destinationDir) {
    return new Promise((resolve, reject) => {
        const unzipProc = child_process.spawn('unzip', ['-o', zipPath, '-d', destinationDir], { stdio: 'inherit'});
        unzipProc.on('error', err => {
            reject(err);
        });
        unzipProc.on('close', code => {
            console.log(`Unzip exited with ${code}`);
            if (code !== 0) {
                reject(new Error(`Unzip exited with ${code}`));
                return;
            }

            resolve();
        });
    });
}

async function unzipRipgrep(zipPath, destinationDir) {
    if (isWindows) {
        try {
            await unzipWindows(zipPath, destinationDir);
        } catch(e) {
            console.error(e);
            console.error('First unzipping attempt failed, retrying');
            await retryUnzipWindowsByPwsh(zipPath, destinationDir);
        }
        
    } else {
        await unzip(zipPath, destinationDir);
    }

    const expectedName = path.join(destinationDir, 'rg');
    if (await fsExists(expectedName)) {
        return expectedName;
    }

    if (await fsExists(expectedName + '.exe')) {
        return expectedName + '.exe';
    }

    throw new Error(`Expecting rg or rg.exe unzipped into ${destinationDir}, didn't find one.`);
}

module.exports = async opts => {
    if (!opts.version) {
        return Promise.reject(new Error('Missing version'));
    }

    if (!opts.target) {
        return Promise.reject(new Error('Missing target'));
    }

    const assetName = ['ripgrep', opts.version, opts.target].join('-') + '.zip';

    if (!await fsExists(tmpDir)) {
        await fsMkdir(tmpDir);
    }

    const assetDownloadPath = path.join(tmpDir, assetName);
    try {
        await getAssetFromGitlab(opts, assetName, tmpDir)
    } catch (e) {
        console.log('Deleting invalid download cache');
        await fsUnlink(assetDownloadPath);
        throw e;
    }

    console.log(`Unzipping to ${opts.destDir}`);
    try {
        const destinationPath = await unzipRipgrep(assetDownloadPath, opts.destDir);
        if (!isWindows) {
            await util.promisify(fs.chmod)(destinationPath, '755');
        }
    } catch (e) {
        console.log('Unzip failed: ' + e.message);
        console.log('Deleting invalid download');
        await fsUnlink(assetDownloadPath);

        throw e;
    }
};

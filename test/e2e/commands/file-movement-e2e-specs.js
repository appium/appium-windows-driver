// FIXME: convert test to with webdriverio
// import wd from 'wd';
// import chai from 'chai';
// import chaiAsPromised from 'chai-as-promised';
// import path from 'path';
// import { tempDir, fs } from '@appium/support';
// import { startServer } from '../../../lib/server';
// import { isAdmin } from '../../../lib/installer';

// chai.should();
// chai.use(chaiAsPromised);

// const TEST_PORT = 4788;
// const TEST_HOST = 'localhost';


// describe('file movement', async function () {
//   if (!await isAdmin()) {
//     return;
//   }

//   let server;
//   let driver;
//   let remotePath;

//   before(async function () {
//     server = await startServer(TEST_PORT, TEST_HOST, true);
//   });

//   after(async function () {
//     if (server) {
//       await server.close();
//     }
//     server = null;
//   });

//   beforeEach(async function () {
//     if (server) {
//       driver = wd.promiseChainRemote(TEST_HOST, TEST_PORT);
//       await driver.init({
//         app: 'Root',
//         platformName: 'Windows',
//       });
//     }
//   });

//   afterEach(async function () {
//     if (driver) {
//       await driver.quit();
//     }
//     if (remotePath) {
//       if (await fs.exists(remotePath)) {
//         await fs.rimraf(path.dirname(remotePath));
//       }
//     }
//     remotePath = null;
//     driver = null;
//   });

//   it('should push and pull a file', async function () {
//     const stringData = `random string data ${Math.random()}`;
//     const base64Data = Buffer.from(stringData).toString('base64');
//     remotePath = await tempDir.path({ prefix: 'appium', suffix: '.tmp' });

//     await driver.pushFile(remotePath, base64Data);

//     // get the file and its contents, to check
//     const remoteData64 = await driver.pullFile(remotePath);
//     const remoteData = Buffer.from(remoteData64, 'base64').toString();
//     remoteData.should.equal(stringData);
//   });

//   it('should be able to delete a file', async function () {
//     const stringData = `random string data ${Math.random()}`;
//     const base64Data = Buffer.from(stringData).toString('base64');
//     remotePath = await tempDir.path({ prefix: 'appium', suffix: '.tmp' });

//     await driver.pushFile(remotePath, base64Data);

//     const remoteData64 = await driver.pullFile(remotePath);
//     const remoteData = Buffer.from(remoteData64, 'base64').toString();
//     remoteData.should.equal(stringData);

//     await driver.execute('windows: deleteFile', { remotePath });

//     await driver.pullFile(remotePath).should.eventually.be.rejectedWith(/does not exist/);
//   });
// });

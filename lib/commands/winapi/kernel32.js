import ffi from 'ffi-napi';
import B from 'bluebird';


const kernel32 = new ffi.Library('kernel32.dll', {
  // DWORD GetLastError();
  'GetLastError': ['uint32', []],
});

export async function getLastError() {
  return await new B((resolve, reject) =>
    // eslint-disable-next-line promise/prefer-await-to-callbacks
    kernel32.GetLastError.async((error, result) => error ? reject(error) : resolve(result))
  );
}

/**
 * Browser IPFS Storage Provider
 *
 * Separate entry point for IPFS functionality.
 * Requires helia and @helia/* packages to be installed.
 *
 * @example
 * ```ts
 * import { IpfsStorageProvider, createIpfsStorageProvider } from '@unicitylabs/sphere-sdk/impl/browser/ipfs';
 * ```
 */
export {
  IpfsStorageProvider,
  createIpfsStorageProvider,
  type IpfsStorageProviderConfig,
} from './storage/IpfsStorageProvider';

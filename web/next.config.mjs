/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // wagmi/walletconnect pull in optional node-only deps that webpack tries to resolve.
    config.externals.push("pino-pretty", "lokijs", "encoding");

    // The `wagmi/connectors` barrel eagerly pulls in the Base Account and
    // Coinbase SDK trees. VaultProof only uses `injected` and `walletConnect`,
    // and those trees have unresolvable subpath imports, so cut them here.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@base-org/account": false,
      "@coinbase/cdp-sdk": false,
      // MetaMask's SDK optionally imports React Native storage.
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
};

export default nextConfig;

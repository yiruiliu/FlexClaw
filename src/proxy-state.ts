let _proxyPort: number | null = null;
export const setProxyPort = (p: number) => { _proxyPort = p; };
export const getProxyPort = () => _proxyPort;

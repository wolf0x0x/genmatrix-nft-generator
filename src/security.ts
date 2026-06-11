const parseList = (value?: string): string[] =>
  (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const isLocalOrigin = (hostname: string) =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

const showSecurityBlock = (message: string) => {
  const root = document.getElementById('root');
  if (!root) return;

  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;">
      <div style="max-width:520px;border:1px solid rgba(148,163,184,.28);background:rgba(15,23,42,.82);border-radius:16px;padding:28px;box-shadow:0 24px 80px rgba(0,0,0,.35);">
        <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#38bdf8;font-weight:700;margin-bottom:10px;">Deployment Guard</div>
        <h1 style="font-size:22px;line-height:1.3;margin:0 0 12px;color:#fff;">Security check failed</h1>
        <p style="font-size:14px;line-height:1.7;margin:0;color:#cbd5e1;">${message}</p>
      </div>
    </div>
  `;
};

export const verifyDeploymentSecurity = (): boolean => {
  if (import.meta.env.DEV) return true;

  const { protocol, origin, hostname } = window.location;
  const allowedOrigins = parseList(import.meta.env.VITE_ALLOWED_ORIGINS);

  if (window.top !== window.self) {
    showSecurityBlock('This page cannot be embedded by third-party websites.');
    return false;
  }

  if (protocol === 'file:') {
    showSecurityBlock('Please deploy and access this app through an HTTPS website instead of opening local build files directly.');
    return false;
  }

  if (protocol !== 'https:' && !isLocalOrigin(hostname)) {
    showSecurityBlock('Public deployments must use HTTPS.');
    return false;
  }

  if (allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
    showSecurityBlock('This origin is not included in the authorized deployment allowlist.');
    return false;
  }

  return true;
};

import express from 'express';

/** Configuración compartida de archivos públicos; no debe usarse para metadatos privados. */
export function archivosEstaticos(directorio: string) {
  return express.static(directorio, {
    dotfiles: 'deny',
    maxAge: '7d',
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (!/\.pdf$/i.test(filePath)) res.setHeader('Content-Security-Policy', 'sandbox');
      if (/\.(svg|html?|xml|xhtml|js)$/i.test(filePath)) res.setHeader('Content-Disposition', 'attachment');
      if (filePath.includes('favicon')) res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    },
  });
}

"use client";

import { Image as ImageIcon, ShieldCheck } from "lucide-react";
import { useMemo } from "react";

type SecureMailFrameProps = {
  html: string;
  title: string;
  allowRemoteImages?: boolean;
  onAllowRemoteImages?: () => void;
  className?: string;
};

function containsRemoteResources(html: string) {
  return /(?:(?:src|srcset|background)\s*=\s*["']\s*(?:https?:)?\/\/|url\(\s*["']?\s*(?:https?:)?\/\/)/i.test(html);
}

function buildProtectedDocument(html: string, allowRemoteImages: boolean) {
  const cleaned = html
    .replace(/<base\b[^>]*>/gi, "")
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, "")
    .replace(/<a\b([^>]*)>/gi, (_match, attrs: string) => {
      const safeAttrs = attrs
        .replace(/\s+target\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
        .replace(/\s+rel\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
      return `<a${safeAttrs} target="_blank" rel="noopener noreferrer">`;
    });

  const imageSources = allowRemoteImages
    ? "https: http: data: blob: cid:"
    : "data: blob: cid:";

  const securityHead = [
    '<meta name="referrer" content="no-referrer">',
    '<meta http-equiv="Content-Security-Policy" content="',
    "default-src 'none'; ",
    `img-src ${imageSources}; `,
    "style-src 'unsafe-inline'; ",
    "font-src data:; ",
    "media-src data: blob:; ",
    "connect-src 'none'; ",
    "frame-src 'none'; ",
    "object-src 'none'; ",
    "form-action 'none'; ",
    "base-uri 'none'",
    '">',
  ].join("");

  if (/<head[\s>]/i.test(cleaned)) {
    return cleaned.replace(/<head([^>]*)>/i, `<head$1>${securityHead}`);
  }

  return `<!doctype html><html><head>${securityHead}</head><body>${cleaned}</body></html>`;
}

export function SecureMailFrame({
  html,
  title,
  allowRemoteImages = false,
  onAllowRemoteImages,
  className = "",
}: SecureMailFrameProps) {
  const hasRemoteResources = useMemo(() => containsRemoteResources(html), [html]);
  const srcDoc = useMemo(
    () => buildProtectedDocument(html, allowRemoteImages),
    [allowRemoteImages, html],
  );

  return (
    <div className={`secure-mail-frame ${className}`.trim()}>
      {hasRemoteResources && !allowRemoteImages && (
        <div className="remote-content-banner">
          <ShieldCheck size={16} />
          <span>Images distantes bloquées pour limiter le pistage.</span>
          {onAllowRemoteImages && (
            <button type="button" onClick={onAllowRemoteImages}>
              <ImageIcon size={15} />
              Charger les images
            </button>
          )}
        </div>
      )}
      {hasRemoteResources && allowRemoteImages && (
        <div className="remote-content-banner allowed">
          <ImageIcon size={15} />
          <span>Images distantes autorisées pour ce message.</span>
        </div>
      )}
      <iframe
        title={title}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
      />
    </div>
  );
}

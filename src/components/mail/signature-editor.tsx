"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { ChangeEvent, MouseEvent, useEffect, useRef, useState } from "react";

type SignatureEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function editorHtml(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return value;
  return `<div>${escapeHtml(value).replace(/\n/g, "<br>")}</div>`;
}

export function SignatureEditor({
  value,
  onChange,
  placeholder = "Cordialement,\nVotre nom\nEntreprise",
}: SignatureEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const selectedImageRef = useRef<HTMLImageElement | null>(null);
  const [selectedImageWidth, setSelectedImageWidth] = useState<number | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) return;
    const next = editorHtml(value);
    if (editor.innerHTML !== next) editor.innerHTML = next;
  }, [value]);

  function emitChange() {
    const editor = editorRef.current;
    if (!editor) return;
    const html = editor.innerHTML
      .replace(/<div><br><\/div>$/i, "")
      .trim();
    onChange(html === "<br>" ? "" : html);
  }

  function selectImage(image: HTMLImageElement | null) {
    selectedImageRef.current = image;
    if (!image) {
      setSelectedImageWidth(null);
      return;
    }
    const renderedWidth = Math.round(image.getBoundingClientRect().width || image.width || 180);
    setSelectedImageWidth(Math.max(60, Math.min(600, renderedWidth)));
  }

  function handleEditorClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;
    selectImage(target instanceof HTMLImageElement ? target : null);
  }

  function insertImageDataUrl(dataUrl: string, alt: string) {
    const editor = editorRef.current;
    if (!editor) return;

    const image = document.createElement("img");
    image.src = dataUrl;
    image.alt = alt;
    image.width = 180;
    image.setAttribute("width", "180");
    image.style.width = "180px";
    image.style.maxWidth = "100%";
    image.style.height = "auto";
    image.style.display = "inline-block";

    const selection = window.getSelection();
    if (selection?.rangeCount) {
      const range = selection.getRangeAt(0);
      if (editor.contains(range.commonAncestorContainer)) {
        range.deleteContents();
        range.insertNode(image);
        range.setStartAfter(image);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        editor.appendChild(image);
      }
    } else {
      editor.appendChild(image);
    }

    editor.appendChild(document.createElement("br"));
    selectImage(image);
    emitChange();
  }

  function handleImageFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > 3 * 1024 * 1024) {
      window.alert("Image trop volumineuse. Utilisez une image de 3 Mo maximum pour une signature e-mail.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") insertImageDataUrl(reader.result, file.name);
    };
    reader.readAsDataURL(file);
  }

  function resizeSelectedImage(width: number) {
    const image = selectedImageRef.current;
    if (!image) return;
    image.width = width;
    image.setAttribute("width", String(width));
    image.style.width = `${width}px`;
    image.style.maxWidth = "100%";
    image.style.height = "auto";
    setSelectedImageWidth(width);
    emitChange();
  }

  function removeSelectedImage() {
    const image = selectedImageRef.current;
    if (!image) return;
    image.remove();
    selectImage(null);
    emitChange();
    editorRef.current?.focus();
  }

  return (
    <div className="signature-editor-shell">
      <div className="signature-editor-toolbar">
        <button type="button" onClick={() => imageInputRef.current?.click()} title="Ajouter une image à la signature">
          <ImagePlus size={16} />
          <span>Image</span>
        </button>
        {selectedImageWidth !== null && (
          <div className="signature-image-resize">
            <span>Largeur</span>
            <input
              type="range"
              min={60}
              max={600}
              step={10}
              value={selectedImageWidth}
              onChange={(event) => resizeSelectedImage(Number(event.target.value))}
              aria-label="Largeur de l’image de signature"
            />
            <strong>{selectedImageWidth}px</strong>
            <button type="button" className="danger" onClick={removeSelectedImage} title="Retirer cette image">
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </div>
      <div
        ref={editorRef}
        className="signature-editor-content"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={emitChange}
        onClick={handleEditorClick}
        onBlur={emitChange}
      />
      <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={handleImageFile} />
      <small>Ajoutez un logo ou une image, cliquez dessus puis ajustez sa largeur.</small>
    </div>
  );
}

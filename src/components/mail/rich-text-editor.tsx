"use client";

import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Link,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Smile,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";
import { useEffect, useState } from "react";

type RichTextEditorProps = {
  value: string;
  onChange: (value: { html: string; text: string }) => void;
  placeholder?: string;
};

const EMOJIS = ["😀", "😂", "😊", "👍", "🙏", "❤️", "🎉", "✅", "📌", "😉", "😎", "🤝", "🔥", "👏", "💡", "🚀"];

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Écrivez votre message...",
}: RichTextEditorProps) {
  const [emojiOpen, setEmojiOpen] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          HTMLAttributes: {
            rel: "noopener noreferrer",
            target: "_blank",
          },
        },
      }),
      Placeholder.configure({ placeholder }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: value || "<p></p>",
    editorProps: {
      attributes: {
        class: "rich-editor-content",
        dir: "ltr",
        lang: "fr",
        spellcheck: "true",
      },
    },
    onUpdate({ editor: current }) {
      onChange({
        html: current.isEmpty ? "" : current.getHTML(),
        text: current.getText({ blockSeparator: "\n" }),
      });
    },
  });

  useEffect(() => {
    if (!editor) return;
    const next = value || "<p></p>";
    const current = editor.isEmpty ? "" : editor.getHTML();
    const normalizedNext = next === "<p></p>" ? "" : next;
    if (current !== normalizedNext) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) {
    return <div className="rich-editor-shell rich-editor-loading">Chargement de l’éditeur…</div>;
  }

  function toggleLink() {
    if (!editor) return;
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }

    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Adresse du lien (https://...)", previous || "https://");
    if (!url) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  function insertEmoji(emoji: string) {
    if (!editor) return;
    editor.chain().focus().insertContent(emoji).run();
    setEmojiOpen(false);
  }

  return (
    <div className="rich-editor-shell">
      <div className="rich-toolbar" role="toolbar" aria-label="Mise en forme du message">
        <button type="button" className={editor.isActive("bold") ? "active" : ""} onClick={() => editor.chain().focus().toggleBold().run()} title="Gras (Ctrl+B)"><Bold size={16} /></button>
        <button type="button" className={editor.isActive("italic") ? "active" : ""} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italique (Ctrl+I)"><Italic size={16} /></button>
        <button type="button" className={editor.isActive("underline") ? "active" : ""} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Souligné (Ctrl+U)"><Underline size={16} /></button>
        <button type="button" className={editor.isActive("strike") ? "active" : ""} onClick={() => editor.chain().focus().toggleStrike().run()} title="Barré"><Strikethrough size={16} /></button>
        <span className="rich-toolbar-divider" />
        <button type="button" className={editor.isActive("bulletList") ? "active" : ""} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Liste à puces"><List size={16} /></button>
        <button type="button" className={editor.isActive("orderedList") ? "active" : ""} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Liste numérotée"><ListOrdered size={16} /></button>
        <button type="button" className={editor.isActive("blockquote") ? "active" : ""} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Citation"><Quote size={16} /></button>
        <span className="rich-toolbar-divider" />
        <button type="button" className={editor.isActive({ textAlign: "left" }) ? "active" : ""} onClick={() => editor.chain().focus().setTextAlign("left").run()} title="Aligner à gauche"><AlignLeft size={16} /></button>
        <button type="button" className={editor.isActive({ textAlign: "center" }) ? "active" : ""} onClick={() => editor.chain().focus().setTextAlign("center").run()} title="Centrer"><AlignCenter size={16} /></button>
        <button type="button" className={editor.isActive({ textAlign: "right" }) ? "active" : ""} onClick={() => editor.chain().focus().setTextAlign("right").run()} title="Aligner à droite"><AlignRight size={16} /></button>
        <button type="button" className={editor.isActive("link") ? "active" : ""} onClick={toggleLink} title="Ajouter ou retirer un lien"><Link size={16} /></button>
        <span className="rich-toolbar-divider" />
        <button type="button" disabled={!editor.can().chain().focus().undo().run()} onClick={() => editor.chain().focus().undo().run()} title="Annuler"><Undo2 size={16} /></button>
        <button type="button" disabled={!editor.can().chain().focus().redo().run()} onClick={() => editor.chain().focus().redo().run()} title="Rétablir"><Redo2 size={16} /></button>
        <div className="emoji-menu-wrap">
          <button type="button" className={emojiOpen ? "active" : ""} onClick={() => setEmojiOpen((open) => !open)} title="Émojis"><Smile size={17} /></button>
          {emojiOpen && (
            <div className="emoji-menu">
              {EMOJIS.map((emoji) => <button key={emoji} type="button" onClick={() => insertEmoji(emoji)}>{emoji}</button>)}
            </div>
          )}
        </div>
      </div>
      <EditorContent editor={editor} className="rich-editor" />
    </div>
  );
}
